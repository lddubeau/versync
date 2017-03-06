export declare const name: string;
export declare const version: string;

export declare class InvalidVersionError extends Error {}

export declare interface VersionInfo {
  version: string;
  line: number
}

export declare type BumpSpecification = string;

export declare function getSources(extraSources: string[]): Promise<string[]>;
export declare function getVersion(filename: string): Promise<VersionInfo|undefined>;
export declare function getValidVersion(filename: string): VersionInfo|undefined;
export declare function verify(filenames: string[], expectedVersion: string): Promise<string[]>;
export declare function setVersion(filenames: string[], version: string): Promise<void>;
export declare function bumpVersion(version: string, bump: BumpSpecification): string;

type MessageListener = Function;

export declare interface RunnerOptions {
  sources?: string[];
  verify?: boolean;
  bump?: BumpSpecification;
  tag?: boolean;
  onMessage: MessageListener|MessageListener[];
}

export declare class Runner {
  constructor(options: RunnerOptions);
  onMessage(listener: MessageListener): void;
  verify(): Promise<void>;
  getSources(): Promise<string[]>;
  getCurrent(): Promise<VersionInfo>;
  setVersion(version: string): Promise<void>;
  run(): Promise<void>;
}

export declare function run(options: RunnerOptions): Promise<void>;
