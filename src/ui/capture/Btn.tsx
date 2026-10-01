import type { ComponentChildren, JSX } from 'preact';

type Props = {
  variante?: 'primaer' | 'sekundaer' | 'gefahr' | 'text' | 'dezent';
  gross?: boolean;
  klein?: boolean;
  children?: ComponentChildren;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  'aria-label'?: string;
  'aria-describedby'?: string;
};

/** Echter Button im Stil von Knopf (Knopf selbst ist auf Links/Standardfälle typisiert). */
export default function Btn({ variante = 'primaer', gross, klein, children, type = 'button', ...rest }: Props) {
  return (
    <button type={type} class={`knopf knopf--${variante}${gross ? ' knopf--gross' : ''}${klein ? ' knopf--klein' : ''}`} {...rest}>
      {children}
    </button>
  );
}
