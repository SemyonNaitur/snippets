import { Component, Input, Output, HostListener, EventEmitter, AfterViewInit, OnDestroy, NgZone } from '@angular/core';

@Component({
  selector: 'signature-pad',
  template: `
    <div [dir]="dir" [id]="id" class="canvas-wrap" [class.canvas-fullscreen]="fullscreen" [ngStyle]="getWrapStyle()">
      <div id="{{id}}-canvas"></div>
      <div class="canvas-bg">
        <div *ngIf="placeholderVisible()" class="canvas-placeholder" [style.color]="color">{{placeholder}}</div>
        <div *ngIf="underline" class="canvas-underline" [style.background-color]="color"></div>
      </div>
      <div class="btns">
        <div class="btns-top">
          <button *ngIf="fullscreenEnabled" class="btn btn-primary fs-toggle-btn" [class.btn-outline-primary]="!fullscreen" [class.hidden]="drawing" (click)="toggleFullscreen()">
            <i class="fa fa-expand fa-lg"></i>
          </button>
          <button class="btn btn-outline-primary clear-btn" [class.hidden]="drawing" (click)="clear()">
            <i class="fa fa-undo fa-lg" [class.fa-flip-horizontal]="dir=='rtl'"></i>
          </button>
        </div>
        <div class="btns-btm">
          <button *ngIf="showSubmit" class="btn btn-outline-primary ok-btn" [class.hidden]="drawing" (click)="submit()">
            <i class="fa fa-check fa-lg"></i>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .canvas-wrap{position: relative; display: inline-block; max-width: 100%; overflow: hidden; border-radius: 6px; z-index: 1000;}
    .canvas-wrap.canvas-fullscreen{position: fixed; top: 0; left: 0;}
    .canvas-bg>div{position: absolute; opacity: .5; user-select: none; z-index: -1;}
    .canvas-placeholder{width: 100%; text-align: center; font-size: 2em; top: 50%; left: 0; margin-top: -1em;}
    .canvas-underline{width: 80%; height: 2px; border-radius: 50px; bottom: 15%; left: 10%;}
    button{position: absolute; border-width: 0; opacity: .9; transition: all .4s ease-in-out; z-index: 1;}
    .btns-top>button{top: 5px;}
    .btns-top>button.hidden{transform: translateY(-150%); opacity: 0;}
    .btns-btm>button{bottom: 5px;}
    .btns-btm>button.hidden{transform: translateY(150%); opacity: 0;}
    .ok-btn{left: 5px; right: auto;}
    .clear-btn{left: auto; right: 5px;}
    .fs-toggle-btn{left: 5px; right: auto;}
    :host-context([dir="rtl"]) .ok-btn, :host-context(.rtl) .ok-btn{left: auto; right: 5px;}
    :host-context([dir="rtl"]) .clear-btn, :host-context(.rtl) .clear-btn{left: 5px; right: auto;}
    :host-context([dir="rtl"]) .fs-toggle-btn, :host-context(.rtl) .fs-toggle-btn{left: auto; right: 5px;}
  `]
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  private static id = 0;
  @Input('placeholder') placeholder = '';
  @Input('lineWidth') lineWidth = 2;
  @Input('scaleLineWidth') scaleLineWidth = true;
  @Input('color') color = '#000';
  @Input('background') background = true;
  @Input('bgColor') bgColor = '#fff';
  @Input('boxShadow') boxShadow = '0 0 1px rgba(0,0,0,.8);';
  @Input('underline') underline = false;
  @Input('fullscreenEnabled') fullscreenEnabled = false;
  @Input('showSubmit') showSubmit = false;
  @Input('dir') dir = 'rtl';
  @Output() onDrawStart = new EventEmitter<void>();
  @Output() onDrawEnd = new EventEmitter<void>();
  @Output() onDirty = new EventEmitter<void>();
  @Output() onClear = new EventEmitter<void>();
  @Output() onReady = new EventEmitter<void>();
  @Output() onSubmit = new EventEmitter<void>();
  private _id = 'signaturePad_' + ++SignaturePadComponent.id;
  private _width: number;
  private _height: number;
  private _initialImage: HTMLImageElement;
  private _initialImageScale = 1;
  private _canvasContainer: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _initializing = false;
  private _initialized = false;
  private _drawing = false;
  private _dirty = false;
  private _scale = { w: 0, h: 0 };
  private _mousePos = { x: 0, y: 0 };
  private _lastPos = this._mousePos;
  private _fullscreen = false;
  private _autoWidthEnabled = false;
  private _drawDisabled = false;
  private _autoWidthTarget: HTMLElement;
  private _bodyEventListeners: Array<{ event: string, func: any }> = [];
  private _resizeDelay: any;
  private _resizePromise = Promise.resolve(true);

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    clearTimeout(this._resizeDelay);
    if (!this._fullscreen && !this.autoWidth) return;
    this._resizeDelay = setTimeout(() => this.setSize(), 200);
  }

  @Input('fullscreen')
  set fullscreen(val: boolean) {
    val = Boolean(val);
    if ((this._fullscreen == val) && !val) return;
    this._fullscreen = val;
    this.setSize();
  }

  @Input('autoWidthEnabled')
  set autoWidthEnabled(val: boolean) {
    val = Boolean(val);
    if (this._autoWidthEnabled == val) return;
    this._autoWidthEnabled = val;
    if (!this._autoWidthTarget) return;
    this.setSize();
  }

  @Input('drawDisabled')
  set drawDisabled(val: boolean) {
    val = Boolean(val);
    if (this._drawDisabled == val) return;
    this._drawDisabled = val;
    this.setCanvasCursor();
  }

  @Input('autoWidthTarget')
  set autoWidthTarget(val: HTMLElement | string) {
    if (!val) return;
    let el: HTMLElement;
    if (typeof val == 'string') {
      el = document.getElementById(val);
      if (!el) { throw new TypeError(`Target not found: ${val}`); }
    } else {
      el = val;
    }
    if (!(el instanceof HTMLElement)) {
      throw new TypeError(`Invalid target type: ${(<any>el).constructor.name}`);
    }
    if (this._autoWidthTarget == el) return;
    this._autoWidthTarget = el;
    if (!this._autoWidthEnabled) return;
    this.setSize();
  }

  @Input('width')
  set width(val: number) {
    if (val != +val || this._width == val) return;
    this._width = +val;
    if (this.autoWidth) return;
    this.setSize();
  }

  @Input('height')
  set height(val: number) {
    if (val != +val || this._height == val) return;
    this._height = val;
    if (this.autoWidth) return;
    this.setSize();
  }

  @Input('initialImage')
  set initialImage(val: HTMLImageElement) {
    if (val instanceof HTMLImageElement) {
      this._initialImage = val;
    } else {
      this._initialImage = null;
    }
    this.init();
  }

  @Input('initialImageUrl')
  set initialImageUrl(val: string) {
    if (!val) {
      this._initialImage = null;
      this.init();
      return;
    }
    let img = new Image;
    img.src = val;
    img.onload = () => {
      this._initialImage = img;
      this.init();
    }
  }

  @Input('initialImageScale')
  set initialImageScale(val: number) {
    if ((val < .1) || (val > 1)) return;
    if (this._initialImageScale == val) return;
    this._initialImageScale = val;
    if (!this._initialImage) return;
    this.init();
  }

  constructor(private _ngZone: NgZone) { }

  ngAfterViewInit() {
    this._canvasContainer = document.getElementById(this._id + '-canvas');
    if (this._width && this._height) {
      this._init({ width: this._width, height: this._height }).then(success => this.onReady.emit());
    } else {
      setTimeout(() => this.onReady.emit());
    }
  }

  ngOnDestroy() {
    this._bodyEventListeners.forEach(o => document.body.removeEventListener(o.event, o.func));
  }

  get id() { return this._id; }
  get dirty() { return this._dirty; }
  get drawing() { return this._drawing; }
  get drawDisabled() { return this._drawDisabled; }
  get fullscreen() { return this._fullscreen; }
  get autoWidth() { return (this._autoWidthEnabled && this._autoWidthTarget); }

  public init(size = { width: this._width, height: this._height }) {
    let sizeChanged = ((this._width != size.width) || (this._height != size.height));
    this._width = size.width;
    this._height = size.height;
    if (this._initialized) {
      this.clear();
      if (sizeChanged) {
        this.setSize(size);
      }
    } else {
      this._init(size);
    }
  }

  private _init(size: Object): Promise<boolean> {
    if (!this._canvasContainer) return;
    this._initializing = true;
    return new Promise((resolve, reject) => {
      this._ngZone.runOutsideAngular(() => {//https://angular.io/api/core/NgZone#runOutsideAngular
        if (size['width'] < 1 || size['height'] < 1) {
          reject('Invalid size');
        }
        this._canvas = <HTMLCanvasElement>document.createElement('canvas');//http://bencentra.com/code/2014/12/05/html5-canvas-touch-events.html
        let canvas = this._canvas;
        canvas.width = size['width'];
        canvas.height = size['height'];
        canvas.style.cursor = 'crosshair';
        canvas.style.transition = 'background-color .2s ease-in-out';
        if (this.dirty) {
          canvas.style.backgroundColor = this.bgColor;
        }

        this.setCanvasCursor();

        while (this._canvasContainer.firstChild) {
          this._canvasContainer.removeChild(this._canvasContainer.firstChild);
        }
        this._canvasContainer.appendChild(canvas);

        this._ctx = canvas.getContext("2d");
        this._ctx.strokeStyle = this.color;
        this._ctx.lineWidth = this.lineWidth;

        this.addInitialImage();

        canvas.addEventListener("mousedown", e => {
          if (this.drawDisabled) return;
          this._drawing = true;
          this._ngZone.run(() => this.onDrawStart.emit());
          this.setDirty();
          canvas.style.backgroundColor = this.bgColor;
          this._lastPos = getMousePos(e);
        }, false);
        canvas.addEventListener("mouseup", e => {
          if (!this._drawing) return;
          this._ngZone.run(() => {
            this._drawing = false;
            this.onDrawEnd.emit();
          });
        }, false);
        canvas.addEventListener("mousemove", e => {
          this._mousePos = getMousePos(e);
        }, false);

        let getMousePos = mouseEvent => {
          let rect = canvas.getBoundingClientRect();
          return {
            x: mouseEvent.clientX - rect.left,
            y: mouseEvent.clientY - rect.top
          };
        }

        canvas.addEventListener("touchstart", e => {
          this._mousePos = getTouchPos(e);
          var touch = e.touches[0];
          var mouseEvent = new MouseEvent("mousedown", {
            clientX: touch.clientX,
            clientY: touch.clientY
          });
          canvas.dispatchEvent(mouseEvent);
        }, false);
        canvas.addEventListener("touchend", function (e) {
          var mouseEvent = new MouseEvent("mouseup", {});
          canvas.dispatchEvent(mouseEvent);
        }, false);
        canvas.addEventListener("touchmove", function (e) {
          var touch = e.touches[0];
          var mouseEvent = new MouseEvent("mousemove", {
            clientX: touch.clientX,
            clientY: touch.clientY
          });
          canvas.dispatchEvent(mouseEvent);
        }, false);

        let getTouchPos = touchEvent => {
          let rect = this._canvas.getBoundingClientRect();
          return {
            x: touchEvent.touches[0].clientX - rect.left,
            y: touchEvent.touches[0].clientY - rect.top
          };
        }

        // Get a regular interval for drawing to the screen
        let w = <any>window;
        w.requestAnimFrame = (function (callback) {
          return w.requestAnimationFrame ||
            w.webkitRequestAnimationFrame ||
            w.mozRequestAnimationFrame ||
            w.oRequestAnimationFrame ||
            w.msRequestAnimaitonFrame ||
            function (callback) {
              w.setTimeout(callback, 1000 / 60);
            };
        })();

        let renderCanvas = () => {
          if (this._drawing) {
            this._ctx.moveTo(this._lastPos.x, this._lastPos.y);
            this._ctx.lineTo(this._mousePos.x, this._mousePos.y);
            this._ctx.stroke();
            this._lastPos = this._mousePos;
          }
        }

        if (!this._initialized) {
          (function drawLoop() {
            w.requestAnimFrame(drawLoop);
            renderCanvas();
          })();

          this._bodyEventListeners.unshift({ event: 'mouseup', func: e => this._drawing = false });
          document.body.addEventListener("mouseup", this._bodyEventListeners[0].func, false);

          // Prevent scrolling when touching the canvas
          let evOpts = <any>{ passive: false };
          let func = e => { if (e.target == this._canvas) { e.preventDefault(); } }
          this._bodyEventListeners.unshift({ event: 'touchstart', func: func });
          document.body.addEventListener("touchstart", this._bodyEventListeners[0].func, evOpts);
          this._bodyEventListeners.unshift({ event: 'touchend', func: func });
          document.body.addEventListener("touchend", this._bodyEventListeners[0].func, evOpts);
          this._bodyEventListeners.unshift({ event: 'touchmove', func: func });
          document.body.addEventListener("touchmove", this._bodyEventListeners[0].func, evOpts);

          this._width = size['width'];
          this._height = size['height'];
          this._initialized = true;
        }

        resolve(true);
        this._initializing = false;
      });
    });
  }

  private setCanvasCursor() {
    if (!this._canvas) return;
    this._canvas.style.cursor = (this.drawDisabled) ? 'not-allowed' : 'crosshair';
  }

  private addInitialImage() {
    if (this._initialImage) {
      const img = this._initialImage;
      const clipScale = this._initialImageScale;
      const canvasWidth = this._width;
      const canvasHeight = this._height;

      const canvasRatio = canvasWidth / canvasHeight;
      const imgRatio = img.width / img.height;

      if (imgRatio > canvasRatio) {
        var scale = canvasWidth / img.width;
      } else {
        var scale = canvasHeight / img.height;
      }
      img.width *= scale;
      img.height *= scale;

      const clipX = (canvasWidth - (img.width * clipScale)) / 2;
      const clipY = (canvasHeight - (img.height * clipScale)) / 2;
      const clipW = img.width * clipScale;
      const clipH = img.height * clipScale;
      this._ctx.drawImage(img, clipX, clipY, clipW, clipH);
    }
  }

  private setDirty(dirty = true) {
    this._dirty = dirty;
    if (dirty) { this.onDirty.emit(); }
  }

  private calcAutoSize() {
    let aw = this._autoWidthTarget.offsetWidth;
    return { width: aw, height: (this._height * (aw / this._width)) };
  }

  public getWrapStyle() {
    return {
      height: ((this._canvas) ? this._canvas.height : this._height) + 'px',
      backgroundColor: this.bgColor,
      boxShadow: this.boxShadow
    }
  }

  placeholderVisible() {
    return !this._initialImage;
  }

  private submit() {
    this.onSubmit.emit();
  }

  public setSize(size = { width: this._width, height: this._height }): Promise<boolean> {
    if (!size.width || !size.height) return;
    this._resizePromise = <Promise<boolean>>this._resizePromise.then(success => new Promise((resolve, reject) => {
      if (this.autoWidth) { size = this.calcAutoSize(); }
      let oldCanvas = this._canvas;
      if (!oldCanvas) return;
      let oldCtx = this._ctx;
      let w = size['width'];
      let h = size['height'];
      let scale = w / oldCanvas.width;
      if (this._fullscreen) {
        let scaleW = window.innerWidth / oldCanvas.width;
        let scaleH = window.innerHeight / oldCanvas.height;
        if (scaleW < scaleH) {
          scale = scaleW;
          w = window.innerWidth;
          h = oldCanvas.height * scale;
        } else {
          scale = scaleH;
          w = oldCanvas.width * scale;
          h = window.innerHeight;
        }
      }
      this._init({ width: w, height: h }).then(success => {
        let newCtx = this._canvas.getContext("2d");
        newCtx.drawImage(oldCanvas, 0, 0, oldCanvas.width, oldCanvas.height, 0, 0, w, h);
        if (this.scaleLineWidth) {
          newCtx.lineWidth = oldCtx.lineWidth * scale;
        }
        resolve(true);
      });
    }));
    return this._resizePromise;
  }

  public toggleFullscreen() {
    this.fullscreen = !this._fullscreen;
  }

  public clear() {
    this._canvas.style.backgroundColor = null;
    let l = this._ctx.lineWidth;
    this._canvas.width = this._canvas.width;
    this.addInitialImage();
    this._ctx.lineWidth = l;
    this.onClear.emit();
    this.setDirty(false);
  }

  public getDataUrl(opts?: Object) {
    let defaultsOpts = { width: this._width, height: this._height };
    opts = Object.assign(defaultsOpts, opts);
    let bg = document.createElement('canvas');
    bg.width = opts['width'];
    bg.height = opts['height'];
    let bgCtx = bg.getContext("2d");
    if (this.background) {
      bgCtx.fillStyle = this.bgColor;
      bgCtx.fillRect(0, 0, opts['width'], opts['height']);
    }
    bgCtx.drawImage(this._canvas, 0, 0, opts['width'], opts['height']);
    return bg.toDataURL();
  }

  public getFile(opts?: Object) {
    return dataURLToBlob(this.getDataUrl());
  }
}

const dataURLToBlob = function (dataURL) {
  var BASE64_MARKER = ';base64,';
  if (dataURL.indexOf(BASE64_MARKER) == -1) {
    var parts = dataURL.split(',');
    var contentType = parts[0].split(':')[1];
    var raw = parts[1];

    return new Blob([raw], { type: contentType });
  }

  var parts = dataURL.split(BASE64_MARKER);
  var contentType = parts[0].split(':')[1];
  var raw = <any>window.atob(parts[1]);
  var rawLength = raw.length;

  var uInt8Array = new Uint8Array(rawLength);

  for (var i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}
