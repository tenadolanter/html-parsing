const NOAH_ARK_CAPACITY = 3;
export const EntryType = {
  Marker: "Marker",
  Element: "Element",
};

const MARKER = { type: EntryType.Marker };

export class FormattingElementList {
  entries = [];
  bookmark = null;

  constructor(treeAdapter) {}

  _getNoahArkConditionCandidates(newElement, neAttrs) {
    const candidates = [];

    const neAttrsLength = neAttrs.length;
    const neTagName = this.treeAdapter.getTagName(newElement);
    const neNamespaceURI = this.treeAdapter.getNamespaceURI(newElement);

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.type === EntryType.Marker) {
        break;
      }

      const { element } = entry;

      if (
        this.treeAdapter.getTagName(element) === neTagName &&
        this.treeAdapter.getNamespaceURI(element) === neNamespaceURI
      ) {
        const elementAttrs = this.treeAdapter.getAttrList(element);

        if (elementAttrs.length === neAttrsLength) {
          candidates.push({ idx: i, attrs: elementAttrs });
        }
      }
    }

    return candidates;
  }

  _ensureNoahArkCondition(newElement) {
    if (this.entries.length < NOAH_ARK_CAPACITY) return;

    const neAttrs = this.treeAdapter.getAttrList(newElement);
    const candidates = this._getNoahArkConditionCandidates(newElement, neAttrs);

    if (candidates.length < NOAH_ARK_CAPACITY) return;

    const neAttrsMap = new Map(
      neAttrs.map((neAttr) => [neAttr.name, neAttr.value])
    );
    let validCandidates = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      if (
        candidate.attrs.every(
          (cAttr) => neAttrsMap.get(cAttr.name) === cAttr.value
        )
      ) {
        validCandidates += 1;

        if (validCandidates >= NOAH_ARK_CAPACITY) {
          this.entries.splice(candidate.idx, 1);
        }
      }
    }
  }

  insertMarker() {
    this.entries.unshift(MARKER);
  }

  pushElement(element, token) {
    this._ensureNoahArkCondition(element);

    this.entries.unshift({
      type: EntryType.Element,
      element,
      token,
    });
  }

  insertElementAfterBookmark(element, token) {
    const bookmarkIdx = this.entries.indexOf(this.bookmark);

    this.entries.splice(bookmarkIdx, 0, {
      type: EntryType.Element,
      element,
      token,
    });
  }

  removeEntry(entry) {
    const entryIndex = this.entries.indexOf(entry);

    if (entryIndex >= 0) {
      this.entries.splice(entryIndex, 1);
    }
  }

  clearToLastMarker() {
    const markerIdx = this.entries.indexOf(MARKER);

    if (markerIdx >= 0) {
      this.entries.splice(0, markerIdx + 1);
    } else {
      this.entries.length = 0;
    }
  }

  getElementEntryInScopeWithTagName(tagName) {
    const entry = this.entries.find(
      (entry) =>
        entry.type === EntryType.Marker ||
        this.treeAdapter.getTagName(entry.element) === tagName
    );

    return entry && entry.type === EntryType.Element ? entry : null;
  }

  getElementEntry(element) {
    return this.entries.find(
      (entry) => entry.type === EntryType.Element && entry.element === element
    );
  }
}
