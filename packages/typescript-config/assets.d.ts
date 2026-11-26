// Bun's bundler resolves asset imports to the emitted file's URL.
declare module "*.woff2" {
  const url: string;
  export default url;
}

declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.png" {
  const url: string;
  export default url;
}

// `@carbon/icons` ships icon descriptors without type declarations.
declare module "@carbon/icons/es/*" {
  const icon: {
    readonly elem: string;
    readonly attrs: Readonly<Record<string, string | number>>;
    readonly content?: readonly {
      elem: string;
      attrs: Readonly<Record<string, string | number>>;
    }[];
    readonly name: string;
    readonly size: number;
  };

  export default icon;
}
