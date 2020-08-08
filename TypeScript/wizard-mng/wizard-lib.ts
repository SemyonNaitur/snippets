import { TMTaskQueue } from '../task-mng';
import { EDEventDispatcher } from '../event-dispatcher';
import { WizardStage } from './wizard-stage';

export type WizFlagCallback = () => boolean;
export type WizNextStageCallback = (stage: WizardStage) => WizardStage;
export type WizStageNavOutEnabledCallback = (stage: WizardStage) => boolean;
export type WizStageIsCompleteCallback = (stage: WizardStage) => boolean;
export type WizScenario = string[];

/**
 * Can be used to trigger a hook in the stage component when prev/next is triggered.
 * If the callback returns false, navigation is prevented.
 */
export type WizStageNavOutHookCallback = (stage: WizardStage) => boolean;

/**
 * "External Function" - Call only by passing it to Wizard.callExternalFunction() to prevent the wizard from getting stuck due to uncaught Errors in the external script
 */
export type WizStageSubmitCallback = () => boolean | Promise<boolean>;

export type WizardEventName = 'init' | 'dirty' | 'goTo' | 'stageStateChange' | 'wizardComplete';

export abstract class WizardBase extends TMTaskQueue {
  protected _nav: WizNavStrategy;
  protected _ev: EDEventDispatcher;
  protected _dirty = false;
  protected _init = false;
  _debug = false;

  abstract currentStage: WizardStage;

  constructor(navStrategy: WizNavStrategyConstructor) {
    super();
    this._nav = wizCreateNavStrategy(navStrategy, () => this.onNavInit());
    let allowedEvents: WizardEventName[] = ['init', 'dirty', 'goTo', 'stageStateChange', 'wizardComplete'];
    this._ev = new EDEventDispatcher(allowedEvents);
  }

  set debug(val: boolean) {
    this._debug = this._nav.debug = Boolean(val);
  }
  get debug() { return this._debug; }

  protected onNavInit() {
    if (this._init) return;
    this._init = true;
    if (this.debug) { console.log('Wizard.onNavInit: Initialized.'); }
    this._ev.notifyListeners('init');
    this._ev.notifyListeners('goTo', this.currentStage);
  }

  protected setDirty(dirty = true) {
    this._dirty = dirty;
  }

  static callExternalFunction(func: () => any): any | Promise<any> {
    try {
      return func();
    } catch (e) {
      setTimeout(() => { throw e });//rethrow 'e' after the return when synchronous functions fail
      return false;
    }
  }
}

/**
 * isNavigateable?: boolean - If stage can be navigated to directly (not by next/prev command).
 */
export interface WizardStageData {
  id: string;
  label?: string;
  isNavigateable?: boolean;
  contentData?: any;
  nextStage?: WizardStage;
  complete?: boolean;
}

/**
 * allowForward?: boolean - Overrides forward navigation prohibition, which is inforced by WizNavStrategy.setCurrentStage.
 *                          Forward navigation refers to direct navigation beyond 'maxReachedStage'.
 *                          In order to display wizard progreess, forward navigation requires all stage labels to be set before navigating forward.
 * force?: boolean - Wizard: overrides isNavigateableStage result.
 *                   strategy classes: overrides checking prevDisabled/nextDisabled.
 */
export interface WizNavOpts {
  allowForward?: boolean;
  force?: boolean;
}

//nav strategy
export interface WizNavStrategyConstructor {
  new(_onInit?: () => void): WizNavStrategy;
}
export function wizCreateNavStrategy(ctor: WizNavStrategyConstructor, _onInit?: () => void): WizNavStrategy {
  return new ctor(_onInit);
}
export interface WizNavStrategy {
  length: number;
  currentStageIndex: number;
  currentStage: WizardStage;
  maxReachedStage: WizardStage;
  prevStage: WizardStage;
  nextStage: WizardStage;
  hasPrevStage: boolean;
  hasNextStage: boolean;
  isInFirstStage: boolean;
  isInLastStage: boolean;
  prevDisabled: boolean;
  prevEnabled: boolean;
  nextDisabled: boolean;
  nextEnabled: boolean;
  debug: boolean;

  setStages(stages: WizardStageData[]): Promise<WizardStage[]>;
  getStages(): WizardStage[];

  getStage(stageId: string): WizardStage;
  hasStage(stageId: string): boolean;
  hasStageInCurrentScenario(stageId: string): boolean;

  getFirstStage(): WizardStage;
  getLastStage(): WizardStage;

  isFirstStage(stageId: string): boolean;
  isLastStage(stageId: string): boolean;

  setCurrentStage(stageId: string, opts: WizNavOpts): Promise<boolean>;

  setScenario(scenario?: WizScenario): Promise<boolean>;
  getScenario(): WizScenario;

  start(data: WizScenario | string): Promise<WizardStage | boolean>;

  prev(opts: WizNavOpts): Promise<WizardStage | false>;
  next(opts: WizNavOpts): Promise<WizardStage | false>;

  getProgress(to: 'current' | 'maxReached'): WizardStage[];
  resetMaxReachedStage(): void;
}
//nav strategy
