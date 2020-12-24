import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { IFileProgress, INewParticipant, INewMessage, ISessionEmittedData, LoggerLevel, Session, SessionEmittedDataType, ErrorCode as SignalerErrorCode, Mode, IFileReady } from 'vidaoo-browser';
import { v4 as uuidv4 } from 'uuid';
import { IDeleteMessage, IEditMessage, IRemoveParticipant, ISignalerError, ITyping } from 'vidaoo-browser/dist/interfaces/ISessionInterfaces';
import { MatDialog } from '@angular/material/dialog';
import { Action, IInjectedData, IResult, MessageDialogComponent } from './message-dialog/message-dialog.component';

interface IAttachment {
  name: string;
  progress?: number;
  size?: number;
  url?: string;
}

interface IMessage {
  message: INewMessage;
  attachment?: IAttachment;
  sent?: boolean;
};

interface IParticipant {
  id: string;
  nickname: string;
  typing: boolean;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('body') body: ElementRef;
  @ViewChild('fileInput') fileInput: ElementRef;

  private _participants: IParticipant[] = [];
  private _typing: boolean = false;
  public attachment: File;
  public bytes = require('bytes');
  public me = { id: uuidv4() };
  public messages: IMessage[] = [];
  public meetingId: string = '';
  public myMessage: string;
  public nickname: string = '';
  public session: Session;
  public sessionSubscription: Subscription;

  constructor(
    private _changeChangeDetectorRef: ChangeDetectorRef,
    private _dialog: MatDialog
  ) {}

  public ngOnInit() {
  }

  public ngOnDestroy(): void {
    this.sessionSubscription.unsubscribe();
  }

  private addMessage(message: IMessage): void {
    this.messages.push(message);
    this.scrollMessagesBottom(); 
  }

  private downloadFile(urlString: string, name: string): void {
    const link = document.createElement('a');
    link.setAttribute('download', name);
    link.href = urlString;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  public getTypingMessage(): string {
    const typingParticipants = this._participants.filter(p => p.typing);
    if (typingParticipants.length === 0) {
      return '';
    } else if (typingParticipants.length === 1) {
      return `${ typingParticipants[0].nickname } is typing...`;
    } else if (typingParticipants.length === 2) {
      return `${ typingParticipants[0].nickname } and ${ typingParticipants[1].nickname } are typing...`;
    } else if (typingParticipants.length === 3) {
      return `${ typingParticipants[0].nickname }, ${ typingParticipants[1].nickname } and ${ typingParticipants[2].nickname } are typing...`;
    } else {
      return `${ typingParticipants[0].nickname } and others are typing...`;
    }
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

  private onDeleteMessage(message: IDeleteMessage): void {
    this.removeMessage(message.id);
  }

  private onEditMessage(message: IEditMessage): void {
    const messageToEdit = this.messages.find(m => m.message.id === message.id);
    if (messageToEdit) {
      messageToEdit.message.text = message.text;
    }
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
        message.attachment.url = file.url;
        message.attachment.size = file.size;
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

  public onMessageClick(message: IMessage): void {
    const isMessageMine = message.message.participantId === this.me.id;
    const injectedData: IInjectedData = {
      messageId: message.message.id,
      messageText: message.message.text,
      showDeleteButton: isMessageMine,
      showDownloadButton: !!message.attachment,
      showEditButton: isMessageMine,
      showReplyButton: !isMessageMine
    };
    this._dialog.open(MessageDialogComponent, { width: '250px', data: injectedData })
      .afterClosed().subscribe((result: IResult) => {
        if (result) {
          switch (result.action) {
            case Action.Delete:
              this.session.deleteMessage(result.data.id);
              break;
            case Action.Download:
              const message = this.messages.find(m => m.message.id === result.data.id);
              if (message) {
                this.downloadFile(message.attachment.url, message.attachment.name);
              }
              break;
            case Action.Edit:
              this.session.editMessage(result.data.id, result.data.text);
              break;
          }
        }
      });
  }

  public onMyMessageKeyup(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.send();
    } else if (this.myMessage && !this._typing) {
      this._typing = true;
      this.session.sendTyping(true);
    } else if (!this.myMessage && this._typing) {
      this._typing = false;
      this.session.sendTyping(false);
    }
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

  private async onNewParticiapnts(participant: INewParticipant): Promise<void> {
    this._participants.push({
      id: participant.id,
      nickname: participant.nickname,
      typing: false
    });
  }

  private async onRemoveParticiapnts(participant: IRemoveParticipant): Promise<void> {
    const participantToRemove = this._participants.find(p => p.id === participant.id);
    if (participantToRemove) {
      this._participants.splice(this._participants.indexOf(participantToRemove), 1);
    }
  }

  private async onSignalerError(error: ISignalerError): Promise<void> {
    switch (error.code) {
      case SignalerErrorCode.ErrorUpload:
        this.removeMessage(error.metadata.id);
        break;
    }
  }

  private async onTyping(params: ITyping): Promise<void> {
    const participant = this._participants.find(p => p.id === params.participantId);
    if (participant) {
      participant.typing = params.typing;
    }
  }

  public onRemoveAttachmentButtonClick(): void {
    this.removeAttachment();
  }

  private async onSessionDataEmitted(data: ISessionEmittedData): Promise<void> {
    switch (data.type) {
      case SessionEmittedDataType.DeleteMessage:
        await this.onDeleteMessage(data.data as IDeleteMessage);
        break;
      case SessionEmittedDataType.EditMessage:
        await this.onEditMessage(data.data as IEditMessage);
        break;
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
      case SessionEmittedDataType.NewParticipant:
        await this.onNewParticiapnts(data.data as INewParticipant);
        break;
      case SessionEmittedDataType.RemoveParticipant:
        await this.onRemoveParticiapnts(data.data as IRemoveParticipant);
        break;
      case SessionEmittedDataType.SignalerError:
        await this.onSignalerError(data.data as ISignalerError);
        break;
      case SessionEmittedDataType.Typing:
        await this.onTyping(data.data as ITyping);
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

  private scrollMessagesBottom(): void {
    this._changeChangeDetectorRef.detectChanges();
    this.body.nativeElement.scrollTop = this.body.nativeElement.scrollHeight - this.body.nativeElement.clientHeight; 
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
    this._typing = false;
    this.session.sendTyping(false);
  }
}
