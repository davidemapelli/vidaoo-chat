import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { IFileProgress, INewParticipant, INewMessage, ISessionEmittedData, LoggerLevel, Session, SessionEmittedDataType, ErrorCode as SignalerErrorCode, Mode, IFileReady } from 'vidaoo-browser';
import { v4 as uuidv4 } from 'uuid';
import { ISignalerError } from 'vidaoo-browser/dist/interfaces/ISessionInterfaces';

interface IAttachment {
  name: string;
  progress?: number;
  size?: number;
  url?: string;
}

interface IMessage {
  message: INewMessage,
  attachment?: IAttachment,
  sent?: boolean
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('body') body: ElementRef;
  @ViewChild('fileInput') fileInput: ElementRef;

  public attachment: File;
  public bytes = require('bytes');
  public me = { id: uuidv4() };
  public messages: IMessage[] = [];
  public meetingId: string = '';
  public myMessage: string;
  public nickname: string = '';
  public session: Session;
  public sessionSubscription: Subscription;

  constructor(private _changeChangeDetectorRef: ChangeDetectorRef) {}

  public ngOnInit() {
  }

  public ngOnDestroy(): void {
    this.sessionSubscription.unsubscribe();
  }

  private addMessage(message: IMessage): void {
    this.messages.push(message);
    this._changeChangeDetectorRef.detectChanges();
    this.body.nativeElement.scrollTop = this.body.nativeElement.scrollHeight - this.body.nativeElement.clientHeight;  
  }

  public onAbortAttachmentUploadButtonClick(fileId: string): void {
    this.session.abortFileUpload(fileId);
    this.removeMessage(fileId);
  }

  public onAttachButtonClick(): void {
    this.fileInput.nativeElement.click();
  }

  public onFileChange(event: Event): void {
    this.attachment = (event.target as HTMLInputElement).files[0];
  }

  public async onJoinButtonClick(): Promise<void> {
    if (!this.meetingId || !this.nickname) {
      return;
    }
    this.session = new Session(LoggerLevel.Verbose);
    this.sessionSubscription = this.session.emitter.subscribe(async (data: ISessionEmittedData) => await this.onSessionDataEmitted(data));
    this.session.joinMeeting({
      meetingId: this.meetingId,
      nickname: this.nickname,
      mode: Mode.ChatOnly,
      webSocketUrl: `https://devapi-vidaoo.xcally.com/meetings`
    });
  }

  private onFileProgress(file: IFileProgress): void {
    const message = this.messages.find(m => m.message.id === file.id);
    if (message) {
      message.attachment.progress = file.progress;
    }
  }

  private onFileReady(file: IFileReady): void {
    if (file.participantId === this.me.id) {
      const message = this.messages.find(m => m.message.id === file.id);
      if (message) {
        message.sent = true;
      }
    } else {
      const message: IMessage = {
        message: {
          id: file.id,
          participantId: file.participantId,
          nickname: file.nickname,
          text: file.text,
          sentAt: file.sentAt
        },
        attachment: {
          name: file.name,
          size: file.size,
          url: file.url
        }
      }
      this.addMessage(message);
    }
  }

  private async onMe(me: INewParticipant): Promise<void> {
    this.me = me;
  }

  private async onNewMessage(message: INewMessage): Promise<void> {
    if (message.participantId === this.me.id) {
      const myMessage: IMessage = this.messages.find(m => m.message.id === message.id);
      myMessage.message.sentAt = message.sentAt;
      myMessage.sent = true;
    } else {
      this.addMessage({ message: message });
    }
  }

  private async onSignalerError(error: ISignalerError): Promise<void> {
    switch (error.code) {
      case SignalerErrorCode.ErrorUpload:
        this.removeMessage(error.metadata.id);
        break;
    }
  }

  public onRemoveAttachmentButtonClick(): void {
    this.removeAttachment();
  }

  private async onSessionDataEmitted(data: ISessionEmittedData): Promise<void> {
    switch (data.type) {
      case SessionEmittedDataType.FileProgress:
        await this.onFileProgress(data.data as IFileProgress);
        break;
      case SessionEmittedDataType.FileReady:
        await this.onFileReady(data.data as IFileReady);
        break;
      case SessionEmittedDataType.Me:
        await this.onMe(data.data as INewParticipant);
        break;
      case SessionEmittedDataType.NewMessage:
        await this.onNewMessage(data.data as INewMessage);
        break;
      case SessionEmittedDataType.SignalerError:
        await this.onSignalerError(data.data as ISignalerError);
        break;
    }
  }

  private removeAttachment(): void {
    this.fileInput.nativeElement.value = '';
    this.attachment = null;
  }

  private removeMessage(id: string): void {
    const message = this.messages.find(m => m.message.id === id);
    if (message) {
      this.messages.splice(this.messages.indexOf(message), 1);
    }
  }

  public async send(): Promise<void> {
    if (!this.myMessage && !this.attachment) {
      return;
    }

    const message: IMessage = {
      message: {
        id: uuidv4(),
        participantId: this.me.id,
        nickname: this.nickname,
        text: this.myMessage,
        sentAt: new Date()
      },
      sent: false
    };

    if (this.attachment) {
      message.attachment = { name: this.attachment.name, progress: 0 };
      await this.session.sendFile(message.message.id, this.attachment, this.myMessage);
      this.removeAttachment();
    } else {
      this.session.sendMessage(message.message.id, message.message.text);
    }

    this.addMessage(message);
    this.myMessage = '';
  }
}
