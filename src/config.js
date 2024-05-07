import TreeAdapter from "./adapter/index.js";
const default_config = {
  // 是否支持自闭和标签
  // 是否支持大写属性
  // 是否支持自定义标签
  scriptingEnabled: true,
  sourceCodeLocationInfo: false,
  treeAdapter: TreeAdapter,
  // 解析报错时调用的方法
  onParseError: null,
}

export default default_config;

