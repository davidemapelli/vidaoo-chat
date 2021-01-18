import { delay } from "src/utils";
import { AttachmentType, IMention } from "vidaoo-browser";
import { Attachments } from "./attachments";
import { FileData } from "./file-data";

export class Message {
  private readonly OPENING_MENTION_TAG = '<span class="text-light-violet">';
  private readonly CLOSING_MENTION_TAG = '</span>';

  private _html: string;  

  public get id(): string {
    return this._id;
  }
  public get participantId(): string {
    return this._participantId;
  }
  public get nickname(): string {
    return this._nickname;
  }
  public get color(): string {
    return this._color;
  }
  public get text(): string {
    return this._text;
  }
  public get html(): string {
    return this._html;
  }
  public get mentions(): IMention[] {
    return this._mentions;
  }
  public get attachments(): Attachments {
    return this._attachments;
  }
  public get replyMessage(): Message {
    return this._replyMessage;
  }
  public get sentAt(): Date {
    return this._sentAt;
  }
  public set sentAt(value: Date) {
    this._sentAt = value;
  }

  constructor(
    private _id: string,
    private _participantId: string,
    private _nickname: string,
    private _color: string,
    private _text: string,
    private _mentions: IMention[],
    private _attachments: Attachments,
    private _replyMessage: Message,
    private _sentAt: Date = null
  ) {
    this.updateHtml();
  }

  public async downloadFiles(): Promise<void> {
    if (!this._attachments || this._attachments.type !== AttachmentType.File) {
      console.warn('This message does not have any file attachment to download.');
      return;
    }
    const files = this._attachments.data as FileData[];
    const link = document.createElement('a');
    document.body.appendChild(link);
    for (let i = 0; i < files.length; i++) {
      if (i !== 0) {
        await delay(800);
      }
      link.setAttribute('download', files[i].name);
      link.setAttribute('href', files[i].url);
      link.click();
    }
    link.remove();
  }

  private updateHtml(): void {
    this._html = this._text;
    for (let i = 0; i < this._mentions?.length; i++) {
      this._html =
        this._html.slice(0, this._mentions[i].start + ((this.OPENING_MENTION_TAG.length * i) + (this.CLOSING_MENTION_TAG.length * i))) +
        this.OPENING_MENTION_TAG +
        this._html.slice(this._mentions[i].start + ((this.OPENING_MENTION_TAG.length * i) + (this.CLOSING_MENTION_TAG.length * i)),
          this._mentions[i].start + ((this.OPENING_MENTION_TAG.length * i) + (this.CLOSING_MENTION_TAG.length * i)) + this._mentions[i].length) +
        this.CLOSING_MENTION_TAG +
        this._html.slice((this._mentions[i].start + ((this.OPENING_MENTION_TAG.length * i) + (this.CLOSING_MENTION_TAG.length * i))) + this._mentions[i].length);
    }
    this._html = this._html?.replace(/\n/g, '<br>');
  }
}