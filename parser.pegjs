Prog = __ values:(@Stmt __)* { return values.filter(e=>e!==null) }
Stmt = LetStmt / RuleStmt / QueryStmt / ("//" [^\n]+ / [\r\n;]) {return null}
LetStmt = "let" _ ident:Symbol _ init:("=" _ Expr)? { return {type: "let", ident, init: init?init[2]:null} }
QueryStmt = "?" _ value:Expr { return { type: "query", value } }
RuleStmt = left:Expr _ "=" _ right:Expr { return { type: "rule", left, right} };
Symbol = $([a-z_]+)
_ = $([\t ]*)
__ = $([\t\n\r ]*)
Atom = ("(" __ value: Expr __ ")" { return value }) / (value: Symbol { return { type: "var", value } } )
Expr = head:Atom tail:(_ @Atom)* {
   let list = tail.reverse();
   let result = head;
   let current = list.pop();
   while (current) {
      result = { type: "apply", left: result, right: current}
      current = list.pop();
   }
   return result
}