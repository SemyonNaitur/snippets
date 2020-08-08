import * as L from './wizard-lib';
import { WizardStage } from './wizard-stage';
import { EDEventCallback } from '../event-dispatcher';

export class Wizard extends L.WizardBase implements L.WizNavStrategy {
  protected _setDirtyFunc = () => this.setDirty();
  protected _progress: WizardStage[] = [];
  protected _navigatableProgress: WizardStage[][] = [[]];

  constructor(navStrategy) {
    super(navStrategy);
  }

  isBusy() {
    return this.tasksPanding;
  }

  //WizNavStrategy compliant class members
  get length() { return this._nav.length; }
  get currentStageIndex() { return this._nav.currentStageIndex; }
  get currentStage() { return this._nav.currentStage; }
  get maxReachedStage() { return this._nav.maxReachedStage; }
  get prevStage() { return this._nav.prevStage; }
  get nextStage() { return this._nav.nextStage; }
  get hasPrevStage() { return Boolean(this.prevStage) }
  get hasNextStage() { return Boolean(this.nextStage) }
  get isInFirstStage() { return this._nav.isInFirstStage; }
  get isInLastStage() { return this._nav.isInLastStage; }
  get prevDisabled() { return this._nav.prevDisabled; }
  get prevEnabled() { return this._nav.prevEnabled; }
  get nextDisabled() { return this._nav.nextDisabled; }
  get nextEnabled() { return this._nav.nextEnabled; }

  setStages(stages: Array<L.WizardStageData | string>) {
    this.cancelTasksByFuncs(['_prev', '_next'], `Canceled by 'setStages'`);
    return this.enqueueTask('_setStages', [stages]);
  }

  getStages() {
    return this._nav.getStages();
  }

  getStage(stageId: string) {
    return this._nav.getStage(stageId);
  }

  hasStage(stageId: string) {
    return this._nav.hasStage(stageId);
  }

  hasStageInCurrentScenario(stageId: string) {
    return this._nav.hasStageInCurrentScenario(stageId);
  }

  getFirstStage() {
    return this._nav.getFirstStage();
  }

  getLastStage() {
    return this._nav.getLastStage();
  }

  isFirstStage(stageId: string) {
    return this._nav.isFirstStage(stageId);
  }

  isLastStage(stageId: string) {
    return this._nav.isLastStage(stageId);
  }

  setCurrentStage(stageId: string) {
    this.cancelTasksByFuncs(['_prev', '_next'], `Canceled by 'setCurrentStage'`);
    let opts: L.WizNavOpts = { allowForward: true, force: true };
    // return this.navigateToStage(stageId, opts);
    return this.enqueueTask('_setCurrentStage', [stageId, opts]);
  }

  setScenario(scenario?: L.WizScenario): Promise<boolean> {
    this.cancelTasksByFuncs(['_prev', '_next'], `Canceled by 'setScenario'`);
    return this.enqueueTask('_setScenario', [scenario]);
  }

  getScenario(): L.WizScenario {
    return this._nav.getScenario();
  }

  start(data?: L.WizScenario | string) {
    return this.enqueueTask('_start', [data]);
  }

  prev(opts: L.WizNavOpts = {}): Promise<WizardStage | false> {
    return this.enqueueTask('_prev', [opts]);
  }

  next(opts: L.WizNavOpts = {}): Promise<WizardStage | false> {
    return this.enqueueTask('_next', [opts]);
  }

  getProgress(to: 'current' | 'maxReached' = 'maxReached') {
    return this._nav.getProgress(to);
  }

  resetMaxReachedStage() {
    this._nav.resetMaxReachedStage();
  }
  //WizNavStrategy compliant class members

  //direct navigation
  navigateToStage(stage: WizardStage | string, opts: L.WizNavOpts = {}): Promise<boolean> {
    this.cancelTasksByFuncs(['_prev', '_next'], `Canceled by 'navigateToStage'`);
    return this.enqueueTask('_navigateToStage', [stage, opts]);
  }

  isNavigateableStage(stage: WizardStage | string): boolean {
    if (typeof stage == 'string') { stage = this.getStage(stage); }
    if (!stage) { return false; }
    return (stage.isNavigateable || this.isFirstStage(stage.id));
  }
  //direct navigation

  //task funcs
  protected _setStages(stages: Array<L.WizardStageData | string>): Promise<WizardStage[]> {
    this.validateStages(stages);
    let s = stages.map(stage => this.initStage(stage));
    this.checkDuplicates(s);
    return this._nav.setStages(s);
  }

  protected _setCurrentStage(stageId: string, opts: L.WizNavOpts = {}): Promise<boolean> {
    // let opts: L.WizNavOpts = {allowForward: true, force: true};
    return this._nav.setCurrentStage(stageId, opts).then(success => {
      if (success) {
        this._ev.notifyListeners('goTo', this.currentStage);
      }
      return success;
    });
  }

  protected _setScenario(scenario: L.WizScenario): Promise<boolean> {
    return this._nav.setScenario(scenario);
  }

  protected _start(data: L.WizScenario | string): Promise<WizardStage | boolean> {
    return this._nav.start(data);
  }

  protected _prev(opts: L.WizNavOpts = {}): Promise<WizardStage | false> {
    if (this.currentStage.callPrePrevHook() === false) {
      return Promise.resolve(<any>false);
    }
    return this._nav.prev(opts).then(stage => {
      if (stage) { this._ev.notifyListeners('goTo', stage); }
      return stage;
    });
  }

  protected _next(opts: L.WizNavOpts = {}): Promise<WizardStage | false> {
    if (this.currentStage.callPreNextHook() === false) {
      return Promise.resolve(<any>false);
    }
    let submit: Promise<any> = (opts.force) ? Promise.resolve(this.nextStage) : this.currentStage.submit();
    return submit.then(success => {
      if (!success) { return Promise.resolve(<any>false); }
      return this._nav.next(opts).then(stage => {
        if (stage) { this._ev.notifyListeners('goTo', stage); }
        return stage;
      });
    }).catch(e => false);
  }

  protected _navigateToStage(stage: WizardStage | string, opts: L.WizNavOpts = {}): Promise<boolean> {
    if (typeof stage == 'string') { stage = this.getStage(stage); }
    if (!(opts.force || this.isNavigateableStage(stage))) {
      throw new Error(`Stage is not navigateable: id: ` + stage.id);
    }
    return this._setCurrentStage(stage.id, opts);
  }
  //task funcs

  //events
  on(event: string, callback: EDEventCallback) {
    this._ev.on(event, callback);
  }
  off(event: string, callback: EDEventCallback) {
    this._ev.off(event, callback);
  }
  //events

  getStageIds(stages: L.WizardStageData[] = this.getStages()) {
    return stages.map(stage => stage.id);
  }

  protected stageNotifyStateChange(stage: WizardStage) {
    if (this.getStages().indexOf(stage) < 0) {
      throw new Error('Stage is not in stage list: id: ' + stage.id);
    }
    if (this.debug) { console.log('Wizard.stageNotifyStateChange:\n  stage:', stage); }
    this._ev.notifyListeners('stageStateChange', stage);
  }

  protected initStage(data: L.WizardStageData | string): WizardStage {
    let stage = new WizardStage(data);
    stage.debug = this.debug;
    return stage.setWizard(this, () => this.setDirty(), () => this.stageNotifyStateChange(stage));
  }

  protected validateStages(stages: Array<L.WizardStageData | string>) {
    if (!Array.isArray(stages)) { throw new TypeError(`Invalid stages array`); }
    if (!this.getStages()) { return true; }//initialization
    let curr = this.currentStage;
    if (!curr) { return true; }
    if (stages.some(stage => ((<string>stage == curr.id) || (<L.WizardStageData>stage).id == curr.id))) { return true; }
    throw new Error('Current stage id is missing from new stages list');
  }

  protected checkDuplicates(stages: L.WizardStageData[]) {
    let ids = this.getStageIds(stages);
    if (ids.length > (new Set(ids)).size) {
      throw new TypeError(`Duplicate ids in list: ` + ids.join());
    }
  }
}
