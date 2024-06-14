const chai = require("chai");
const assert = chai.assert;
const { ParseFragment, ParserOption, SerializeFragment }  = require("../lib/index.umd.js");

describe("解析html片段", () => {
  it("能正确的解析html片段", () => {
    let sourceCode = '<div><div>Hi there!</div><span>Hi there!</span></div>';
    const option = {
      ...ParserOption,
    }
    const ast = ParseFragment(sourceCode, option);
    const code = SerializeFragment(ast, option);
    assert.equal(sourceCode, code);
  })
})
