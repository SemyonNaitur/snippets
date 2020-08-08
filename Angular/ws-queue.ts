import { HttpEvent, HttpEventType, HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface WSQueueItemOpts {
  observeHttpEvents: boolean;
}

interface WSResponse {
  status: string;
}

interface PromiseContainer {
  instance: Promise<any>,
  resolve: (val: any) => void,
  reject: (error: any) => void
}

export class WSQueueItem {
  private _o: Observable<any>;
  private _s: Subscription;
  private _opts: WSQueueItemOpts;
  private _response: WSResponse;
  private _errorResponse: any;
  private _lastSubscribeTime = 0;
  private _tries = 0;
  private _status: 'CREATED' | 'PENDING' | 'SUCCESS' | 'FAIL' | 'CANCELED';
  private _progress = 0;
  private _unsubscribed = false;
  private _promise: PromiseContainer;
  wsName: string;
  section: string;
  label: string;
  retryLimit = 0;
  retryDelay = 2;
  userParams: { [prop: string]: any } = {};

  constructor(o: Observable<any>, opts?: WSQueueItemOpts) {
    if (!(o instanceof Observable)) {
      throw new TypeError('Invalid observable');
    }
    this._opts = Object.assign({}, opts);
    this._o = o;
    this._status = 'CREATED';
  }

  get response() { return this._response; }
  get error() { return this._errorResponse; }
  get status() { return this._status; }
  get progress() { return this._progress; }
  get unsubscribed() { return this._unsubscribed; }

  private _next = (val: WSResponse | HttpEvent<any> | HttpErrorResponse) => {
    if (this._opts.observeHttpEvents) {
      if (val instanceof HttpErrorResponse) {
        this._onHttpError(<HttpErrorResponse>val);
      } else {
        this._onHttpEvent(<HttpEvent<any>>val);
      }
    } else {
      this._onResponse(<WSResponse>val);
    }
  }

  private _error = e => {
    if (!this._reSubscribe()) {
      this._errorResponse = e;
      if (this._promise) { this._promise.reject(e); }
    }
  }

  private _initPromise(reset = false) {
    if (!this._promise || reset) {
      const p = <PromiseContainer>{};
      p.instance = new Promise((resolve, reject) => {
        p.resolve = resolve;
        p.reject = reject;
      });
      this._promise = p;
    }
  }

  private _subscribe() {
    if (this._s || this._unsubscribed) return;
    this._status = 'PENDING';
    this._progress = 0;
    this._s = this._o.subscribe(this._next, this._error);
    this._lastSubscribeTime = Date.now();
  }

  private _reSubscribe() {
    if (this._unsubscribed) return;
    if (!this.retryLimit || (this.retryLimit > this._tries++)) {
      this._s = null;
      this._response = null;
      this._errorResponse = null;
      let delay = this.retryDelay * 1000;
      if (delay > 0) {
        delay -= (Date.now() - this._lastSubscribeTime);
      }
      if (delay < 0) {
        delay = 0;
      }
      setTimeout(() => this._subscribe(), delay);
      return true;
    } else {
      this._status = 'FAIL';
      return false;
    }
  }

  private _onHttpEvent(event: HttpEvent<any>) {
    switch (event.type) {
      case HttpEventType.UploadProgress:
        this._progress = Math.round(100 * event.loaded / event.total);
        break;
      case HttpEventType.Response:
        this._onHttpResponse(event.body);
        break;
    }
  }

  private _onHttpError(event: HttpErrorResponse) {
    if (!this._reSubscribe()) {
      this._status = 'FAIL';
      this._errorResponse = event;
      if (this._promise) { this._promise.reject(event); }
    }
  }

  private _onHttpResponse(body: any) {
    this._resolveResponse(body);
  }

  private _onResponse(res: WSResponse) {
    let reSubscribed = false;
    if (res.status == 'HTTP_ERROR') {
      reSubscribed = this._reSubscribe();
    }

    if (!reSubscribed) {
      this._resolveResponse(res);
    }
  }

  private _resolveResponse(res: any) {
    this._status = 'SUCCESS';
    this._progress = 100;
    this._response = res;
    if (this._promise) { this._promise.resolve(res); }
  }

  subscribe(/*callback?: ItemCallback*/) {
    if (this._unsubscribed) {
      throw new Error('Item unsubscribed');
    }
    this._subscribe();
  }

  retry() {
    if (this._unsubscribed) {
      throw new Error('Item unsubscribed');
    }
    this._tries = 0;
    if ((this._status == 'FAIL') || (this._status == 'CANCELED')) {
      this.subscribe(/*this._callback*/);
    }
  }

  toPromise(): Promise<any> | null {
    switch (this._status) {
      case 'CREATED':
        this._initPromise();
        this._subscribe();
        return this._promise.instance;
      case 'PENDING':
        this._initPromise();
        return this._promise.instance;
      case 'SUCCESS':
        return (this._promise) ? this._promise.instance : Promise.resolve(this._response);
      case 'FAIL':
        return (this._promise) ? this._promise.instance : Promise.reject(this._errorResponse);
      case 'CANCELED':
        if (this._unsubscribed) {
          throw new Error('Item unsubscribed');
        }
        this._initPromise(true);
        this._subscribe();
        return this._promise.instance;
    }
  }

  cancel() {
    if (!this._s) return;
    this._s.unsubscribe();
    this._status = 'CANCELED';
  }

  unsubscribe() {
    this.cancel();
    this._unsubscribed = true;
  }
}

type WSQueueItemConditionFunc = (item: WSQueueItem) => boolean;

export class WSQueue {
  private _items: WSQueueItem[] = [];

  get length() { return this._items.length; }

  add(o: Observable<any>, opts?: WSQueueItemOpts): WSQueueItem {
    const item = new WSQueueItem(o, opts);
    this._items.push(item);
    return item;
  }

  getItems(cond?: WSQueueItemConditionFunc): WSQueueItem[] {
    if (!cond) {
      return this._items.slice(0);
    }
    return this._items.filter(item => cond(item));
  }

  cancel(cond?: WSQueueItemConditionFunc): WSQueueItem[] {
    const items = this.getItems(cond);
    items.forEach(item => item.cancel());
    return items;
  }

  delete(items: WSQueueItem | WSQueueItem[], cancel = false) {
    if (!Array.isArray(items)) { items = [items]; }
    if (cancel) {
      items.forEach(item => item.cancel());
    }
    this._items = this._items.filter(item => (<WSQueueItem[]>items).indexOf(item) < 0);
  }

  clear(cancel = false) {
    this.delete(this._items, cancel);
  }
}
