const chai = require("chai");
const assert = chai.assert;
const { ParseFragment, ParserOption, SerializeFragment }  = require("../lib/index.umd.js");

describe("解析html自定义标签", () => {
  it("能正确的解析html自定义标签", () => {
    let sourceCode = '<div><divname>Hi there!</divname></div>';
    const option = {
      ...ParserOption,
    }
    const ast = ParseFragment(sourceCode, option);
    const code = SerializeFragment(ast, option);
    assert.equal(sourceCode, code);
  })
})
