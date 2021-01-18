import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ContentChange, QuillEditorComponent } from 'ngx-quill';
import 'quill-mention';
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { AttachmentType, ErrorCode as SignalerErrorCode, IDeleteMessage, IEditMessage, IFileData, IFileProgress, IMention, IMessageParams, INewMessage, INewParticipant, IRemoveParticipant, ISessionEmittedData, ISignalerError, ITyping, LoggerLevel, Mode, Session, SessionEmittedDataType } from 'vidaoo-browser';
import { Action, IInjectedData, IResult, MessageDialogComponent } from './message-dialog/message-dialog.component';
import { Attachments } from './models/attachments';
import { FileData } from './models/file-data';
import { Message } from './models/message';
import { IParticipant } from './models/participant';

const randomColor = require('randomcolor');

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('body') body: ElementRef;
  @ViewChild('fileInput') fileInput: ElementRef;
  @ViewChild('myMessageEditor') myMessageEditor: QuillEditorComponent;

  public AttachmentType = AttachmentType;
  public bytes = require('bytes');
  public filesToSend: File[] = [];
  public me: IParticipant = {
    id: uuidv4(),
    nickname: 'Davide',
    color: '#e2bcf2',
    typing: false
  };
  public messages: Message[] = [];
  public meetingId: string = '5f9bec757ecfe6001103cabf';
  public participants: IParticipant[] = [];
  public replyMessage: Message;
  public session: Session;
  public sessionSubscription: Subscription;
  public modules = {
    keyboard: {
      bindings: {
        enter: {
          key: 13, // Enter key
          handler: (range, context) => this.send()
        }
      }
    },
    mention: {
      allowedChars: /^[A-Za-z\sÅÄÖåäö]*$/,
      isolateCharacter: true,
      showDenotationChar: false,
      spaceAfterInsert: false,
      source: (searchTerm, renderList) => {
        const values = this.participants
          .filter(p => p.id !== this.me.id)
          .map(p => { return { id: p.id, value: p.nickname }; });
        if (searchTerm.length === 0) {
          renderList(values, searchTerm);
        } else {
          const matches = [];
          values.forEach((entry) => {
            if (entry.value.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) {
              matches.push(entry);
            }
          })
          renderList(matches, searchTerm);
        }
      }
    },
    toolbar: false
  }
  
  constructor(
    private _changeChangeDetectorRef: ChangeDetectorRef,
    private _dialog: MatDialog
  ) {}

  public ngOnInit(): void {
  }

  public ngAfterViewInit(): void {
  }

  public ngOnDestroy(): void {
    this.sessionSubscription.unsubscribe();
  }

  private addMessage(message: Message): void {
    this.messages.push(message);
    this.scrollMessagesBottom(); 
  }

  public getTypingMessage(): string {
    const typingParticipants = this.participants.filter(p => p.typing);
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
    if (!this.meetingId || !this.me.nickname) {
      return;
    }
    this.session = new Session(LoggerLevel.Verbose);
    this.sessionSubscription = this.session.emitter.subscribe(async (data: ISessionEmittedData) => await this.onSessionDataEmitted(data));
    this.session.joinMeeting({
      meetingId: this.meetingId,
      nickname: this.me.nickname,
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
      // ToDo
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
    this.me.id = me.id;
    this.participants.push(this.me);
  }

  public onMessageClick(message: Message): void {
    const isMessageMine = message.participantId === this.me.id;
    const injectedData: IInjectedData = {
      message: message,
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
                await message.downloadFiles();
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

  public onMyMessageEditorContentChanged(event: ContentChange): void {
    if (event.content.ops.length === 1 && event.content.ops[0].insert === '\n') {
      this.session.sendTyping(false);
    } else if (event.oldDelta.ops.length === 1 && event.oldDelta.ops[0].insert === '\n') {
      this.session.sendTyping(true);
    }
  }

  private async onNewMessage(message: INewMessage): Promise<void> {
    if (message.participantId === this.me.id) {
      const myMessage = this.messages.find(m => m.id === message.id);
      myMessage.sentAt = message.sentAt;
      if (message.attachments && message.attachments.type === AttachmentType.File) {
        message.attachments.data.forEach((fileData: IFileData) => {
          const myFile = myMessage.attachments.data.find((file: FileData) => file.id === fileData.id);
          myFile.url = fileData.url;
        });
      }
    } else {
      this.addMessage(new Message(
        message.id,
        message.participantId,
        message.nickname,
        this.participants.find(p => p.id === message.participantId).color,
        message.text,
        message.mentions,
        message.attachments ? new Attachments(
          message.attachments.type,
          message.attachments.data.map(d => { return new FileData(d.id, d.name, d.size, d.url) }))
          : null,
        this.messages.find(m => m.id === message.replyId),
        message.sentAt
      ));
    }
  }

  private async onNewParticipant(participant: INewParticipant): Promise<void> {
    this.participants.push({
      id: participant.id,
      nickname: participant.nickname,
      color: randomColor(),
      typing: false
    });
  }

  private async onRemoveParticipant(participant: IRemoveParticipant): Promise<void> {
    const participantToRemove = this.participants.find(p => p.id === participant.id);
    if (participantToRemove) {
      this.participants.splice(this.participants.indexOf(participantToRemove), 1);
    }
  }

  private async onSignalerError(error: ISignalerError): Promise<void> {
    console.warn('Signaler error:', error);
    switch (error.code) {
      case SignalerErrorCode.ErrorUpload:
        this.removeMessage(error.metadata.id);
        break;
      default:
        break;
    }
  }

  private async onTyping(params: ITyping): Promise<void> {
    const participant = this.participants.find(p => p.id === params.participantId);
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
        await this.onNewParticipant(data.data as INewParticipant);
        break;
      case SessionEmittedDataType.RemoveParticipant:
        await this.onRemoveParticipant(data.data as IRemoveParticipant);
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
    let { text, mentions } = this.getTextAndMentions();
    const params: IMessageParams = {};
    if (mentions.length > 0) {
      params.mentions = mentions;
    }
    if (this.replyMessage) {
      params.replyId = this.replyMessage.id;
    }
    if (this.filesToSend.length > 0) {
      params.attachments = {
        type: AttachmentType.File,
        data: this.filesToSend
      };
    }
    const result = await this.session.sendMessage(text, params);
    const message = new Message(
      result.id,
      this.me.id,
      this.me.nickname,
      this.me.color,
      text,
      mentions,
      result.uploadingFiles ?
        new Attachments(
          AttachmentType.File,
          result.uploadingFiles.map(f => { return new FileData(f.id, f.name, f.size, null, 0) }))
        : null,
      this.replyMessage
    );
    this.addMessage(message);
    this.myMessageEditor.quillEditor.setText('');
    this.replyMessage = null;
    this.removeAttachments();
    this.me.typing = false;
    this.session.sendTyping(false);
  }

  private getTextAndMentions() {
    const delta = this.myMessageEditor.quillEditor.getContents();
    let text = '';
    const mentions: IMention[] = [];
    delta.ops.forEach(o => {
      if (typeof(o.insert) === 'string') {
        text += o.insert;
      } else {
        const insert = (o.insert as any);
        if (insert.mention) {
          mentions.push({
            start: text.length,
            length: insert.mention.value.length,
            participantId: insert.mention.id
          });
          text += insert.mention.value
        }
      }
    });
    return {
      text: text.slice(0, text.length - 1), // Remove quill newline character at the end of the text
      mentions: mentions
    };
  }
}
