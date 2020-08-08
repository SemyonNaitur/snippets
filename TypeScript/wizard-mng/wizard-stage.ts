import * as L from './wizard-lib';

export class WizardStage implements L.WizardStageData {
  private _id: string;
  private _label: string;
  private _isNavigateable: boolean;
  private _contentInstance: Object;
  private _contentData: any;
  private _wiz: L.WizardBase;
  private _wizSetDirtyFunc: () => void;
  private _notifyStateChangeFunc: (complete: boolean) => void;
  private _nextStage: WizardStage | L.WizNextStageCallback;
  private _prePrevHook: L.WizStageNavOutHookCallback;
  private _preNextHook: L.WizStageNavOutHookCallback;
  private _prevEnabled: boolean | L.WizStageNavOutEnabledCallback = true;
  private _nextEnabled: boolean | L.WizStageNavOutEnabledCallback = true;
  private _isComplete: boolean | L.WizStageIsCompleteCallback = false;
  private _submitFunc: L.WizStageSubmitCallback;//"External Function" - Call only by passing it to WizardBase.callExternalFunction() to prevent the wizard from getting stuck due to uncaught Errors in the external script
  private _submitting: boolean | L.WizFlagCallback;
  private _dirty: boolean;
  private _complete: boolean;
  debug = false;

  constructor(data: L.WizardStageData | string) {
    if (typeof data != 'object') { data = { id: data }; }
    if (!data.id || typeof data.id != 'string') { throw new Error(`Invalid 'id'`); }
    this._id = data.id;
    this._label = data.label;
    this._isNavigateable = data.isNavigateable;
    this._contentData = data.contentData;
    this._complete = data.complete;
  }

  set label(label: string) { this.setLabel(label); }
  set isNavigateable(isNavigateable: boolean) { this._isNavigateable = isNavigateable; }
  set prePrevHook(fn: L.WizStageNavOutHookCallback) { this.setPrePrevHook(fn); }
  set preNextHook(fn: L.WizStageNavOutHookCallback) { this.setPreNextHook(fn); }
  set prevEnabled(en: boolean | L.WizStageNavOutEnabledCallback) { this.setPrevEnabled(en); }
  set nextEnabled(en: boolean | L.WizStageNavOutEnabledCallback) { this.setNextEnabled(en); }
  set submitting(submitting: boolean | L.WizFlagCallback) { this.setSubmitting(submitting); }

  get id() { return this._id; }
  get label() { return this._label; }
  get isNavigateable() { return this._isNavigateable; }
  get contentInstance() { return this._contentInstance; }
  get contentData() { return this._contentData; }
  get nextStage() {
    let next = (typeof this._nextStage == 'function') ? this._nextStage(this) : this._nextStage;
    if (!(next instanceof WizardStage)) { throw new TypeError('Invalid stage'); }
    return next;
  }
  get prevEnabled() { return (typeof this._prevEnabled == 'function') ? this._prevEnabled(this) : this._prevEnabled; }
  get nextEnabled() { return (typeof this._nextEnabled == 'function') ? this._nextEnabled(this) : this._nextEnabled; }
  get submitting() { return (typeof this._submitting == 'function') ? this._submitting() : this._submitting; }
  get isCurrent() { return (this._wiz.currentStage == this); }
  get dirty() { return this._dirty; }
  get complete() { return this._complete; }
  get isComplete() { return (typeof this._isComplete == 'function') ? this._isComplete(this) : this._isComplete; }

  set contentData(data: any) { this._contentData = data; }
  set contentInstance(instance: Object) { this._contentInstance = instance; }

  setWizard(wiz: L.WizardBase, wizSetDirtyFunc?: () => void, notifyStateChangeFunc?: () => void): WizardStage {
    if (this._wiz) { throw new Error('Wizard is already set'); }
    if (!(wiz instanceof L.WizardBase)) { throw new TypeError(`Invalid wizard`); }
    this._wiz = wiz;
    this._wizSetDirtyFunc = wizSetDirtyFunc;
    this._notifyStateChangeFunc = notifyStateChangeFunc;
    return this;
  }

  setLabel(label: string): WizardStage {
    setTimeout(() => this._label = label);
    return this;
  }

  setPrePrevHook(fn: L.WizStageNavOutHookCallback): WizardStage {
    if (typeof fn != 'function') {
      throw new TypeError(`Invalid 'prePrevHook' function: ` + fn);
    }
    this._prePrevHook = fn;
    return this;
  }

  setPreNextHook(fn: L.WizStageNavOutHookCallback): WizardStage {
    if (typeof fn != 'function') {
      throw new TypeError(`Invalid 'preNextHook' function: ` + fn);
    }
    this._preNextHook = fn;
    return this;
  }

  setPrevEnabled(en: boolean | L.WizStageNavOutEnabledCallback): WizardStage {
    if (['boolean', 'function'].indexOf(typeof en) < 0) {
      throw new TypeError(`Invalid 'prevEnabled' value: ` + en);
    }
    this._prevEnabled = en;
    return this;
  }

  setNextEnabled(en: boolean | L.WizStageNavOutEnabledCallback): WizardStage {
    if (['boolean', 'function'].indexOf(typeof en) < 0) {
      throw new TypeError(`Invalid 'nextEnabled' value: ` + en);
    }
    this._nextEnabled = en;
    return this;
  }

  setIsComplete(isComplete: boolean | L.WizStageNavOutEnabledCallback): WizardStage {
    if (['boolean', 'function'].indexOf(typeof isComplete) < 0) {
      throw new TypeError(`Invalid 'isComplete' value: ` + isComplete);
    }
    this._isComplete = isComplete;
    return this;
  }

  callPrePrevHook(): boolean {
    return (typeof this._prePrevHook == 'function') ? this._prePrevHook(this) : true;
  }

  callPreNextHook(): boolean {
    return (typeof this._preNextHook == 'function') ? this._preNextHook(this) : true;
  }

  setSubmitting(submitting: boolean | L.WizFlagCallback): WizardStage {
    if (['boolean', 'function'].indexOf(typeof submitting) < 0) {
      throw new TypeError(`Invalid 'submitting' value: ` + submitting);
    }
    this._submitting = submitting;
    return this;
  }

  onSubmit(fn: L.WizStageSubmitCallback): WizardStage {
    if (typeof fn != 'function') {
      throw new TypeError(`Invalid 'onSubmit' callback`);
    }
    this._submitFunc = fn;
    return this;
  }

  setDirty(dirty = true) {
    if (this.dirty == dirty) return;
    this._dirty = dirty;
    if (dirty && typeof this._wizSetDirtyFunc == 'function') {
      this._wizSetDirtyFunc();
    }
  }

  submit(): Promise<boolean> {
    let res: boolean | Promise<boolean>;
    if (!this.nextEnabled) {
      res = false;
    } else if (!this._submitFunc) {
      res = true;
    } else {
      res = L.WizardBase.callExternalFunction(this._submitFunc);
    }
    return (res instanceof Promise) ? res : Promise.resolve(res);
  }

  setComplete(complete = true) {
    if (this.complete == complete) return;
    this._complete = complete;
    if (typeof this._notifyStateChangeFunc == 'function') {
      this._notifyStateChangeFunc(complete);
    }
  }
}
