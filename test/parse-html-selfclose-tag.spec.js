const chai = require("chai");
const assert = chai.assert;
const { Parse, ParserOption, Serialize }  = require("../lib/index.umd.js");

describe("解析html自闭合标签", () => {
  it("能正确的解析html自闭合标签", () => {
    let sourceCode = '<div><AutoMate/></div>';
    const option = {
      ...ParserOption,
      selfCloseEnabled: true,
    }
    const ast = Parse(sourceCode, option);
    const code = Serialize(ast, option);
    assert.equal(sourceCode, code);
  })
})
