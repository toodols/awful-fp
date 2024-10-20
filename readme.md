tiny and super unoptimized functional-like language that involves repeatedly reducing an expression using predefined rules

```js
let apple
let identity
identity x = x // A rule that transforms all instances of identity(x) to x

// '?' simplifies the given expression and prints it out
? identity (identity apple) // This simplifies to => identity apple => apple

let const
let orange
const x y = x
let always_orange = const orange // let assignment is valid

? always_orange apple // Simplifies to => const orange apple => orange
```

for unadulterated idiocy [read ./rules](./rules)

limitations:
program slows down and **I MEAN** slows down when expressions get complicated