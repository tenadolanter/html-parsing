const chai = require("chai");
const assert = chai.assert;
const { Parse, ParserOption }  = require("../lib/index.umd.js");

describe("解析html", () => {
  it("能正确的解析html", () => {
    let sourceCode = '<!DOCTYPE html><html><head></head><body>Hi there!</body></html>';
    const option = {
      ...ParserOption,
    }
    const result = Parse(sourceCode, option);
    sourceCode = code;
    // assert.equal(sourceCode, resultCode);
  })
})
