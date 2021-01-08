import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export enum Action {
  Delete,
  Download,
  Edit,
  Reply
}

export interface IInjectedData {
  messageId: string;
  messageText: string;
  showDeleteButton: boolean;
  showDownloadButton: boolean;
  showEditButton: boolean;
  showReplyButton: boolean;
}

export interface IResult {
  action: Action,
  data: any
}

@Component({
  selector: 'app-message-dialog',
  templateUrl: './message-dialog.component.html',
  styleUrls: ['./message-dialog.component.css']
})
export class MessageDialogComponent implements OnInit {

  public showDeleteButton: boolean = false;
  public showEditButton: boolean = false;
  public showEditMessageSection: boolean = false;
  public showReplyButton: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<MessageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public injectedData: IInjectedData
  ) { }

  ngOnInit(): void {
  }

  public onReplyButtonClick(): void {
    const result: IResult = {
      action: Action.Reply,
      data: {
        id: this.injectedData.messageId
      }
    };
    this.dialogRef.close(result);
  }

  public onEditButtonClick(): void {
    this.showEditMessageSection = true;
    this.dialogRef.updateSize('100%');
  }

  public onDeleteButtonClick(): void {
    const result: IResult = {
      action: Action.Delete,
      data: {
        id: this.injectedData.messageId
      }
    };
    this.dialogRef.close(result);
  }

  public onDownloadButtonClick(): void {
    const result: IResult = {
      action: Action.Download,
      data: {
        id: this.injectedData.messageId
      }
    };
    this.dialogRef.close(result);
  }

  public onSaveButtonClick(): void {
    const result: IResult = {
      action: Action.Edit,
      data: {
        id: this.injectedData.messageId,
        text: this.injectedData.messageText
      }
    };
    this.dialogRef.close(result);
  }

}
