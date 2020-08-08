import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SignaturePadComponent } from './signature-pad.component';

@NgModule({
    imports: [CommonModule],
    declarations: [SignaturePadComponent],
    exports: [SignaturePadComponent],
})
export class SignaturePadModule { }
