const chai = require("chai");
const assert = chai.assert;
const { ParseFragment, ParserOption, SerializeFragment }  = require("../lib/index.umd.js");

describe("解析html标签里面的大写属性", () => {
  it("能正确的解析html标签里面的大写属性", () => {
    let sourceCode = '<div><div AttrName="test"></div></div>';
    const option = {
      ...ParserOption,
      uppercaseAttrEnabled: true,
    }
    const ast = ParseFragment(sourceCode, option);
    const code = SerializeFragment(ast, option);
    assert.equal(sourceCode, code);
  })
})
