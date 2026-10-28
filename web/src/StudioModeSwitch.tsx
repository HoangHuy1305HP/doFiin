type Props = {
  checked: boolean;
  onToggle: () => void;
};

export default function StudioModeSwitch({ checked, onToggle }: Props) {
  return (
    <button
      type="button"
      className="studio-mode-switch"
      role="switch"
      aria-label="Studio mode"
      aria-checked={checked}
      onClick={onToggle}
    >
      <span>Studio mode</span>
      <span className="studio-mode-track" aria-hidden="true">
        <span className="studio-mode-thumb" />
      </span>
    </button>
  );
}
