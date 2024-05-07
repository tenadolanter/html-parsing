const chai = require("chai");
const assert = chai.assert;
const { ParseFragment, ParserOption, SerializeFragment }  = require("../lib/index.umd.js");

describe("解析html大写标签", () => {
  it("能正确的解析html大写标签", () => {
    let sourceCode = '<div><DivName>Hi there!</DivName></div>';
    const option = {
      ...ParserOption,
      uppercaseTagEnabled: true,
    }
    const ast = ParseFragment(sourceCode, option);
    const code = SerializeFragment(ast, option);
    assert.equal(sourceCode, code);
  })
})
