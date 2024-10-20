import { analyze } from "./interpreter.ts";
import { parse } from "./parser.mjs";

const ast = parse(await Deno.readTextFile("rules"));

analyze(ast);
