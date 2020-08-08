export type EDEventCallback = (data: any) => void;

export class EDEventDispatcher {
  private _eventListeners: { [event: string]: Set<EDEventCallback> } = {};

  constructor(private _eventList: string[]) {
    if (!Array.isArray(_eventList) || !_eventList.length) {
      throw new Error('Invalid event list');
    }
  }

  get eventList() { return this._eventList; }

  on(event: string, callback: EDEventCallback) {
    if (this.eventList.indexOf(event) < 0) {
      throw new Error('Unsupported event: ' + event);
    }
    if (!(event in this._eventListeners)) {
      this._eventListeners[event] = new Set<EDEventCallback>();
    }
    this._eventListeners[event].add(callback);
    return this._eventListeners[event].has(callback);
  }

  off(event: string, callback: EDEventCallback) {
    if (event in this._eventListeners) {
      this._eventListeners[event].delete(callback);
    }
    return !this._eventListeners[event].has(callback);
  }

  notifyListeners(event: string, data?: any) {
    if (this.eventList.indexOf(event) < 0) {
      throw new Error('Unsupported event: ' + event);
    }
    if (!(event in this._eventListeners)) return;
    this._eventListeners[event].forEach(val => val(data));
  }
}
