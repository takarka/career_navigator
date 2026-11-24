import { useEffect, useRef } from 'preact/hooks';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

interface Props {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  dark: boolean;
  minHeight?: string;
}

export function CodeEditor({ value, onChange, readOnly, dark, minHeight }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    const extensions = [
      basicSetup,
      javascript(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(!!readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange?.(u.state.doc.toString());
      }),
      ...(dark ? [oneDark] : []),
    ];
    const v = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host.current! });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, readOnly]);

  // внешнее изменение значения (смена сценария)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div class="code-editor" ref={host} style={minHeight ? { minHeight } : undefined} />;
}
