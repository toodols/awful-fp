type Program = Statement[];
type Statement = LetStatement | RuleStatement | QueryStatement;

type LetStatement = {
	type: "let";
	ident: string;
	init?: Expression;
};

type QueryStatement = {
	type: "query";
	value: Expression;
};

type RuleStatement = {
	type: "rule";
	left: Expression;
	right: Expression;
};

type Expression = VarExpression | ApplyExpression | SymbolExpression;

type VarExpression = {
	type: "var";
	value: string;
};

type ApplyExpression = {
	type: "apply";
	left: Expression;
	right: Expression;
};

type SymbolExpression = {
	type: "symbol";
	isBinding?: true;
	symbol: number;
};

class Scope {
	symbols: Record<string, number> = {};
	constructor(public parent?: Scope) {}
	get(name: string): number | undefined {
		if (name in this.symbols) {
			return this.symbols[name];
		}
		if (this.parent) {
			return this.parent.get(name);
		}
	}
	new(name: string, value: number) {
		this.symbols[name] = value;
	}
}

class Symbols {
	names: string[] = [];
	next(name: string): number {
		return this.names.push(name);
	}
}

// x=0 { x } => 0
// x=0 { x y } => y=1, 0 1
function analyzeExpression(
	symbols: Symbols,
	scope: Scope,
	expression: Expression,
	conditions?: {
		/*
			A variable on the lhs of an application must be defined.
			This is legal:
			```
			let a
			a x = ...
			```
			```
			let a
			let b
			a (b x) = ...
			```

			This is illegal:
			```
			a x = ...
			```
			```
			let a
			a (b x) = ...
			```
		*/
		applyLhsFlag?: boolean;

		/*
			RHS of a rule may not have free variables
			This is legal:
			```
			let a
			a x = x
			```
			```
			let a
			let b
			a x = b
			```
			
			This is illegal:
			```
			let a
			a x = y
			```
		*/
		ruleRhsFlag?: boolean;
	}
): Expression {
	switch (expression.type) {
		case "var": {
			const symbol = scope.get(expression.value);
			if (symbol !== undefined) {
				return { type: "symbol", symbol };
			} else if (conditions?.applyLhsFlag || conditions?.ruleRhsFlag) {
				throw new Error(`Variable ${expression.value} is not defined`);
			} else {
				const symbol = symbols.next(expression.value);
				scope.new(expression.value, symbol);
				return { type: "symbol", symbol, isBinding: true };
			}
		}
		case "apply": {
			const left = analyzeExpression(symbols, scope, expression.left, {
				applyLhsFlag: true,
				ruleRhsFlag: conditions?.ruleRhsFlag,
			});
			const right = analyzeExpression(symbols, scope, expression.right, {
				ruleRhsFlag: conditions?.ruleRhsFlag,
			});

			return { type: "apply", left, right };
		}
		case "symbol":
			throw new Error(
				"Symbols should not appear in pre-analyzed expressions"
			);
	}
}

function display(symbols: Symbols, expression: Expression): string {
	switch (expression.type) {
		case "var":
			return expression.value;
		case "apply":
			return `(${display(symbols, expression.left)} ${display(
				symbols,
				expression.right
			)})`;
		case "symbol":
			if (expression.isBinding) {
				return `[${symbols.names[expression.symbol - 1]}:${
					expression.symbol
				}]`;
			}
			return `${symbols.names[expression.symbol - 1]}:${
				expression.symbol
			}`;
	}
}

function matches(
	value: Expression,
	pattern: Expression,
	bindings: Record<number, Expression> = {}
): boolean {
	switch (pattern.type) {
		case "symbol":
			if (pattern.isBinding) {
				bindings[pattern.symbol] = value;
				return true;
			} else if (bindings[pattern.symbol]) {
				return deepEqual(bindings[pattern.symbol], value);
			} else if (
				value.type === "symbol" &&
				pattern.symbol === value.symbol
			) {
				return true;
			}
			return false;
		case "apply":
			if (value.type !== "apply") {
				return false;
			}
			return (
				matches(value.left, pattern.left, bindings) &&
				matches(value.right, pattern.right, bindings)
			);
		case "var":
			throw new Error("var should not appear in matches");
	}
}

export function rewrite(
	value: Expression,
	right: Expression,
	bindings: Record<number, Expression>
): Expression {
	switch (right.type) {
		case "symbol":
			return bindings[right.symbol] || right;
		case "apply":
			return {
				type: "apply",
				left: rewrite(value, right.left, bindings),
				right: rewrite(value, right.right, bindings),
			};
		case "var":
			throw new Error("var should not appear in matches");
	}
}

function deepEqual(expression: Expression, other: Expression): boolean {
	// deno-lint-ignore no-explicit-any
	const other_ = other as any;
	if (expression.type !== other_.type) {
		return false;
	}
	switch (expression.type) {
		case "apply":
			return (
				deepEqual(expression.left, other_.left) &&
				deepEqual(expression.right, other_.right)
			);
		case "symbol":
			return expression.symbol === other_.symbol;
		case "var":
			return expression.value === other_.value;
	}
}

function reduceRule(expression: Expression, rule: RuleStatement): Expression {
	let current = expression;
	while (true) {
		const old = current;
		const bindings = {};
		if (matches(expression, rule.left, bindings)) {
			current = rewrite(expression, rule.right, bindings);
		} else if (expression.type === "apply") {
			current = {
				type: "apply",
				left: reduceRule(expression.left, rule),
				right: reduceRule(expression.right, rule),
			};
		}
		if (deepEqual(current, old)) {
			break;
		}
	}

	return current;
}

function reduceRules(
	expression: Expression,
	rules: RuleStatement[],
	symbols: Symbols
): Expression {
	let current = expression;
	while (true) {
		const old = current;
		for (const rule of rules) {
			current = reduceRule(current, rule);
		}
		if (deepEqual(current, old)) {
			break;
		}
	}
	return current;
}

export function analyze(program: Program) {
	const symbols = new Symbols();
	const scope = new Scope();
	const rules: RuleStatement[] = [];

	for (const statement of program) {
		switch (statement.type) {
			case "let": {
				if (scope.get(statement.ident)) {
					throw new Error("Variable already defined");
				}
				const symbol = symbols.next(statement.ident);
				scope.new(statement.ident, symbol);
				const ruleScope = new Scope(scope);
				if (statement.init) {
					rules.push({
						type: "rule",
						left: { type: "symbol", symbol },
						right: analyzeExpression(
							symbols,
							ruleScope,
							statement.init
						),
					});
				}
				break;
			}
			case "rule": {
				const ruleScope = new Scope(scope);
				const left = analyzeExpression(
					symbols,
					ruleScope,
					statement.left
				);
				const right = analyzeExpression(
					symbols,
					ruleScope,
					statement.right,
					{
						ruleRhsFlag: true,
					}
				);

				rules.push({
					type: "rule",
					left: reduceRules(left, rules, symbols),
					right,
				});
				break;
			}
			case "query": {
				const expression = analyzeExpression(
					symbols,
					scope,
					statement.value,
					{
						ruleRhsFlag: true,
					}
				);
				console.log(
					display(symbols, expression),
					"=",
					display(symbols, reduceRules(expression, rules, symbols))
				);
				break;
			}
		}
	}
}
