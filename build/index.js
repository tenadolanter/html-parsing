const { Parse }  = require("../src/index.js");
let sourceCode = '<!DOCTYPE html><html><head></head><body>Hi there!</body></html>';
const result = Parse(sourceCode);
console.log("result", result)