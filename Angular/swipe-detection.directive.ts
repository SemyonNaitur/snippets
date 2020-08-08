import { Directive, ElementRef, Input, Output, EventEmitter, Renderer2, NgZone } from '@angular/core';

export class TouchData {
  private _startTime: number;
  private _currX: number;
  private _currY: number;
  private _currTarget: HTMLElement;
  private _endTime: number;
  private _moveOrient: 'hor' | 'ver';
  swipedir: 'left' | 'right' | 'up' | 'down';

  constructor(private _startX: number, private _startY: number, private _startTarget: HTMLElement) {
    this._startTime = Date.now();
    this.setCurr(_startX, _startY, _startTarget);
  }

  set moveOrient(moveOrient: 'hor' | 'ver') {
    if (this.moveOrient) return;
    this._moveOrient = moveOrient;
  }

  get startTime() { return this._startTime; }
  get startX() { return this._startX; }
  get startY() { return this._startY; }
  get startTarget() { return this._startTarget; }
  get currX() { return this._currX; }
  get currY() { return this._currY; }
  get currTarget() { return this._currTarget; }
  get endTime() { return this._endTime; }
  get distX() { return (this._currX - this._startX); }
  get distY() { return (this._currY - this._startY); }
  get duration() { return ((this._endTime || Date.now()) - this._startTime); }
  get moveOrient() { return this._moveOrient; }

  public setCurr(x: number, y: number, target: HTMLElement) {
    this._currX = x;
    this._currY = y;
    this._currTarget = target;
  }

  public setEnd(x: number, y: number, target: HTMLElement) {
    this._endTime = Date.now();
    this.setCurr(x, y, target);
  }
}

@Directive({ selector: '[swipeDetection]' })
export class SwipeDetectionDirective {
  @Input() moveDelay = 10;
  @Input() threshold = 150; //required min distance traveled to be considered swipe
  @Input() restraint = 100; // maximum distance allowed at the same time in perpendicular direction
  @Input() allowedTime = 300; // maximum time allowed to travel that distance
  @Output('onTouchstart') touchstart = new EventEmitter<TouchData>();
  @Output('onTouchmove') touchmove = new EventEmitter<TouchData>();
  @Output('onTouchend') touchend = new EventEmitter<TouchData>();
  @Output() onSwipe = new EventEmitter<string>();
  private _touchData: TouchData;
  private _moveDelayTimer: any;


  constructor(el: ElementRef, renderer: Renderer2) {
    renderer.listen(el.nativeElement, 'mousedown', e => this.onTouchstart(e));
    renderer.listen(el.nativeElement, 'mousemove', e => this.onTouchmove(e));
    renderer.listen(el.nativeElement, 'mouseup', e => this.onTouchend(e));
    renderer.listen(el.nativeElement, 'touchstart', e => this.onTouchstart(e));
    renderer.listen(el.nativeElement, 'touchmove', e => this.onTouchmove(e));
    renderer.listen(el.nativeElement, 'touchend', e => this.onTouchend(e));
  }

  private onTouchstart(e) {
    let c = ('changedTouches' in e) ? e.changedTouches[0] : e;
    this._touchData = new TouchData(c.pageX, c.pageY, e.target);
    this.touchstart.emit(this._touchData);
  }

  private onTouchmove(e) {
    if (!this._touchData) return;
    this.pauseEvent(e);
    let c = ('changedTouches' in e) ? e.changedTouches[0] : e;
    let t = this._touchData;
    if (!t.moveOrient) {
      let distX = Math.abs(t.distX);
      let distY = Math.abs(t.distY);
      if (distX || distY) {
        t.moveOrient = (distX > distY) ? 'hor' : 'ver';
      }
    }
    t.setCurr(c.pageX, c.pageY, e.target);
    clearTimeout(this._moveDelayTimer);
    setTimeout(() => this.touchmove.emit(t), this.moveDelay);
  }

  private onTouchend(e) {
    if (!this._touchData) return;
    let c = ('changedTouches' in e) ? e.changedTouches[0] : e;
    this._touchData.setEnd(c.pageX, c.pageY, e.target);
    this.checkSwipe();
    this.touchend.emit(this._touchData);
    this._touchData = null;
  }

  private checkSwipe() {//http://www.javascriptkit.com/javatutors/touchevents2.shtml
    let t = this._touchData;
    if (t.duration <= this.allowedTime) { // first condition for awipe met
      if (Math.abs(t.distX) >= this.threshold && Math.abs(t.distY) <= this.restraint) { // 2nd condition for horizontal swipe met
        t.swipedir = (t.distX < 0) ? 'left' : 'right' // if dist traveled is negative, it indicates left swipe
      }
      else if (Math.abs(t.distY) >= this.threshold && Math.abs(t.distX) <= this.restraint) { // 2nd condition for vertical swipe met
        t.swipedir = (t.distY < 0) ? 'up' : 'down' // if dist traveled is negative, it indicates up swipe
      }
      this.onSwipe.emit(t.swipedir);
    }
  }

  private pauseEvent(e) {//https://stackoverflow.com/questions/5429827/how-can-i-prevent-text-element-selection-with-cursor-drag
    if (e.stopPropagation) { e.stopPropagation(); }
    if (e.preventDefault) { e.preventDefault(); }
    e.cancelBubble = true;
    e.returnValue = false;
    return false;
  }
}
