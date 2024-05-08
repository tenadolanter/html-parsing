const chai = require("chai");
const assert = chai.assert;
const { ParseFragment, ParserOption, SerializeFragment }  = require("../lib/index.umd.js");

describe("解析html后保留位置信息", () => {
  it("能正确的解析html的位置信息", () => {
    let sourceCode = `
    <div
      AttrName="test"
    ></div>
    `;
    const option = {
      ...ParserOption,
      uppercaseTagEnabled: true,
      uppercaseAttrEnabled: true,
      sourceCodeLocationInfo: true,
    }
    const ast = ParseFragment(sourceCode, option);
    const code = SerializeFragment(ast, option);
    assert.equal(sourceCode, code);
  })
})
