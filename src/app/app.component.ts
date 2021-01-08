import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { AttachmentType, ISignalerError, ITyping, IUploadingFileData, IDeleteMessage, IEditMessage, IFileProgress, INewParticipant, INewMessage, IRemoveParticipant, ISessionEmittedData, LoggerLevel, Session, SessionEmittedDataType, ErrorCode as SignalerErrorCode, Mode } from 'vidaoo-browser';
import { v4 as uuidv4 } from 'uuid';
import { MatDialog } from '@angular/material/dialog';
import { Action, IInjectedData, IResult, MessageDialogComponent } from './message-dialog/message-dialog.component';
import { delay } from 'src/utils';

interface IMessage {
  id: string;
  participantId: string;
  nickname: string;
  text: string;
  attachments: {
    type: AttachmentType;
    data: {
      id: string;
      name: string;
      size: number;
      url: string;
      progress?: number;
    }[]
  },
  replyMessage: IMessage;
  sentAt: Date;
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
  public AttachmentType = AttachmentType;
  public bytes = require('bytes');
  public filesToSend: File[] = [];
  public me = { id: uuidv4() };
  public messages: IMessage[] = [];
  public meetingId: string = '';
  public myMessage: string;
  public nickname: string = '';
  public replyMessage: IMessage;
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

  private async downloadFiles(files: { name: string, url: string }[]): Promise<void> {
    const link = document.createElement('a');
    document.body.appendChild(link);
    for (let i = 0; i < files.length; i++) {
      if (i !== 0) {
        await delay(500);
      }
      link.setAttribute('download', files[i].name);
      link.setAttribute('href', files[i].url);
      link.click();
    }
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

  public onCancelReplyButtonClick(): void {
    this.replyMessage = null;
  }

  public onFileChange(event: Event): void {
    this.filesToSend.splice(0, this.filesToSend.length);
    const files = (event.target as HTMLInputElement).files;
    for (let i = 0; i < files.length; i++) {
      this.filesToSend.push(files[i]);
    }
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
    const messageToEdit = this.messages.find(m => m.id === message.id);
    if (messageToEdit) {
      messageToEdit.text = message.text;
    }
  }

  private onFileProgress(fileProgress: IFileProgress): void {
    const message = this.messages.find(m => m.id === fileProgress.messageId);
    if (message) {
      const file = message.attachments.data.find(f => f.id === fileProgress.id);
      if (file) {
        file.progress = fileProgress.progress;
      }
    }
  }

  private async onMe(me: INewParticipant): Promise<void> {
    this.me = me;
  }

  public onMessageClick(message: IMessage): void {
    const isMessageMine = message.participantId === this.me.id;
    const injectedData: IInjectedData = {
      messageId: message.id,
      messageText: message.text,
      showDeleteButton: isMessageMine,
      showDownloadButton: !!message.attachments,
      showEditButton: isMessageMine,
      showReplyButton: !isMessageMine
    };
    this._dialog.open(MessageDialogComponent, { width: '250px', data: injectedData })
      .afterClosed().subscribe(async (result: IResult) => {
        if (result) {
          switch (result.action) {
            case Action.Delete:
              this.session.deleteMessage(result.data.id);
              break;
            case Action.Download:
              const message = this.messages.find(m => m.id === result.data.id);
              if (message) {
                await this.downloadFiles(message.attachments.data.map(f => { return { name: f.name, url: f.url } }));
              }
              break;
            case Action.Edit:
              this.session.editMessage(result.data.id, result.data.text);
              break;
            case Action.Reply:
              this.replyMessage = this.messages.find(m => m.id === result.data.id);
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
      const myMessage = this.messages.find(m => m.id === message.id);
      myMessage.sentAt = message.sentAt;
      myMessage.sent = true;
    } else {
      this.addMessage({
        id: message.id,
        participantId: message.participantId,
        nickname: message.nickname,
        text: message.text,
        attachments: message.attachments,
        sentAt: message.sentAt,
        replyMessage: this.messages.find(m => m.id === message.replyId)
      });
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

  public onRemoveFilesButtonClick(): void {
    this.removeAttachments();
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

  private removeAttachments(): void {
    this.fileInput.nativeElement.value = '';
    this.filesToSend.splice(0, this.filesToSend.length);    
  }

  private removeMessage(id: string): void {
    const message = this.messages.find(m => m.id === id);
    if (message) {
      this.messages.splice(this.messages.indexOf(message), 1);
    }
  }

  private scrollMessagesBottom(): void {
    this._changeChangeDetectorRef.detectChanges();
    this.body.nativeElement.scrollTop = this.body.nativeElement.scrollHeight - this.body.nativeElement.clientHeight; 
  }

  public async send(): Promise<void> {
    if (!this.myMessage && !this.filesToSend) {
      return;
    }

    const message: IMessage = {
      id: uuidv4(),
      participantId: this.me.id,
      nickname: this.nickname,
      text: this.myMessage,
      sentAt: new Date(),
      attachments: null,
      replyMessage: this.replyMessage,
      sent: false
    };

    if (this.filesToSend.length > 0) {
      const files: IUploadingFileData[] = await this.session.sendMessageWithFiles(
        message.id,
        message.text,
        this.filesToSend,
        this.replyMessage?.id
      );
      message.attachments = {
        type: AttachmentType.File,
        data: files.map(f => { return {
          id: f.id,
          name: f.name,
          size: f.size,
          url: '',
          progress: 0
        }})
      };
    } else {
      this.session.sendMessage(
        message.id,
        message.text,
        this.replyMessage?.id);
    }

    this.addMessage(message);
    this.myMessage = '';
    this.replyMessage = null;
    this.removeAttachments();
    this._typing = false;
    this.session.sendTyping(false);
  }
}
