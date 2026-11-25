import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';

interface Props {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  dark: boolean;
  minHeight?: string;
}

let impl: ComponentType<Props> | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  loading ??= import('./CodeEditorImpl.tsx').then((m) => {
    impl = m.CodeEditorImpl;
  });
  return loading;
}

/** Обёртка: CodeMirror грузится отдельным чанком при первом показе редактора. */
export function CodeEditor(props: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!impl) void load().then(() => force((n) => n + 1));
  }, []);
  const Impl = impl;
  if (!Impl) {
    return (
      <pre class="code-editor" style={props.minHeight ? { minHeight: props.minHeight } : undefined} aria-busy="true">
        {props.value}
      </pre>
    );
  }
  return <Impl {...props} />;
}
