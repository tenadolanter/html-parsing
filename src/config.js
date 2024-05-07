import TreeAdapter from "./adapter/index.js";
const default_config = {
  // 是否支持自闭和标签
  selfCloseEnabled: false,
  // 是否支持大写属性
  uppercaseAttrEnabled: false,
  // 是否支持标签大写
  uppercaseTagEnabled: false,
  // 是否解析 <script> 和 <template> 标签中的内容
  scriptingEnabled: true,
  // 是否在 AST 节点中添加源代码位置信息
  sourceCodeLocationInfo: false,
  // 指定用于构建 DOM 树的适配器
  treeAdapter: TreeAdapter,
  // 解析报错时调用的方法
  onParseError: null,
}

export default default_config;

