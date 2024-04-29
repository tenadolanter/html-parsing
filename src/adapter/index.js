import { DOCUMENT_MODE } from "../common"

export default {
  createDocument: () => {
    return {
      nodeName: "#document",
      childNodes: [],
      mode: DOCUMENT_MODE.NO_QUIRKS,
    }
  },
}