export class FileData {
  public get id(): string {
    return this._id;
  }
  public get name(): string {
    return this._name;
  }
  public get size(): number {
    return this._size;
  }
  public get url(): string {
    return this._url;
  }
  public set url(value: string) {
    this._url = value;
  }
  public get progress(): number {
    return this._progress;
  }
  public set progress(value: number) {
    this._progress = value;
  }

  constructor(
    private _id: string,
    private _name: string,
    private _size: number,
    private _url?: string,
    private _progress?: number
  ) { }
}