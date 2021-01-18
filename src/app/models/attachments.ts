import { AttachmentType } from "vidaoo-browser";
import { FileData } from "./file-data";

export class Attachments {
  public get type(): AttachmentType {
    return this._type;
  }
  public get data(): FileData[] {
    return this._data;
  }

  constructor(
    private _type: AttachmentType,
    private _data: FileData[]
  ) { }
}