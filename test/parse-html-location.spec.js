const chai = require("chai");
const assert = chai.assert;
const { Parse, ParserOption, Serialize }  = require("../lib/index.umd.js");

describe("解析html后保留位置信息", () => {
  it("能正确的解析html的位置信息", () => {
    let sourceCode = `
      <div>
        <div
          AttrName="test"
          name="haha"
          sex="nan"
        ></div>
      </div>
    `;
    const option = {
      ...ParserOption,
    }
    const ast = Parse(sourceCode, option);
    const code = Serialize(ast, option);
    assert.equal(sourceCode, code);
  })
})
