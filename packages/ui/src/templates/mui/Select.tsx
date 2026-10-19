import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popover from '@mui/material/Popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  NativeFieldFooter,
  NativeFieldLabel,
  fieldClass,
  useFieldIds,
} from '../../components/Field/FieldParts.js';
import { TextField } from '../../components/Field/TextField.js';
import { Icon } from '../../components/Icon/Icon.js';
import type { ComboboxProps, SelectOption, SelectProps } from '../../contract.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';

/** A text box in the same field when the "other" option is chosen (অন্যান্য). */
function OtherText({
  show,
  value,
  onChange,
  disabled,
}: {
  show: boolean;
  value?: string | undefined;
  onChange?: ((v: string) => void) | undefined;
  disabled?: boolean | undefined;
}) {
  const { messages } = useUi();
  if (!show) return null;
  return (
    <TextField
      label={messages.field.otherSpecify}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="ui-field-other"
    />
  );
}

/** The dialog a control sits in, where its list must render, else the page body. */
function insideDialog(element: HTMLElement | null): HTMLElement {
  return element?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? document.body;
}

/** Case-insensitive search inside an option's label, the same in both languages. */
const fold = (text: string) => text.normalize('NFC').toLocaleLowerCase();
const matches = (label: string, query: string) => fold(label).includes(fold(query.trim()));

/**
 * Single select on the listbox pattern: a button names the value and the field, opens a list in
 * MUI's popover with the arrow keys or a press, and a search box filters a long list (more than
 * 10 options). The chosen option is marked with a check.
 */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  searchable,
  otherOptionId,
  otherValue,
  onOtherChange,
  ...field
}: SelectProps) {
  const { messages } = useUi();
  const ids = useFieldIds(field.id);
  const labelId = `${ids.inputId}-label`;
  const valueId = `${ids.inputId}-value`;
  const listId = `${ids.inputId}-list`;
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const selected = value === undefined ? inner : value;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const withSearch = searchable ?? options.length > 10;
  const shown =
    withSearch && query.trim() ? options.filter((o) => matches(o.label, query)) : options;
  const current = options.find((o) => o.id === selected);
  const disabled = field.disabled || field.readOnly || field.locked;
  const describedBy = [field.helper && ids.helperId, field.error && ids.errorId]
    .filter(Boolean)
    .join(' ');

  const open = () => {
    setQuery('');
    setAnchor(trigger.current);
  };
  const close = () => {
    setAnchor(null);
    trigger.current?.focus();
  };
  const pick = (id: string) => {
    setInner(id);
    onChange?.(id);
    close();
  };
  const toFirstOption = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    list.current
      ?.querySelector<HTMLElement>('[role="option"]:not([aria-disabled="true"])')
      ?.focus();
  };

  return (
    <div className={fieldClass({ ...field, className: undefined })} data-control="select">
      <NativeFieldLabel {...field} labelId={labelId} />
      <button
        ref={trigger}
        id={ids.inputId}
        type="button"
        className="ui-input ui-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? listId : undefined}
        aria-labelledby={`${valueId} ${labelId}`}
        aria-describedby={describedBy || undefined}
        aria-invalid={field.error ? true : undefined}
        disabled={disabled}
        name={field.name}
        value={selected ?? ''}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          open();
        }}
      >
        <span
          id={valueId}
          className="ui-select-value"
          data-placeholder={current ? undefined : true}
        >
          {current?.label ?? placeholder ?? messages.field.selectPlaceholder}
        </span>
        <Icon icon={ChevronDown} />
      </button>
      <NativeFieldFooter {...field} ids={ids} />
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={close}
        disableRestoreFocus
        // inside a dialog the list renders in it, so the dialog's modality never hides it
        container={() => insideDialog(trigger.current)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { className: 'ui-popover', style: { minWidth: anchor?.offsetWidth } },
        }}
      >
        {withSearch && (
          <div className="ui-popover-search">
            <Icon icon={Search} size="sm" />
            <input
              type="search"
              className="ui-input"
              aria-label={messages.field.search}
              placeholder={messages.field.search}
              // the list opens with the search box ready, as on the approved screens
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={toFirstOption}
            />
          </div>
        )}
        <MenuList
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="ui-listbox"
          variant="selectedMenu"
          autoFocusItem={!withSearch}
        >
          {shown.length === 0 ? (
            <li role="presentation" className="ui-listbox-empty">
              {messages.field.noResults}
            </li>
          ) : (
            shown.map((option) => {
              const isSelected = option.id === selected;
              return (
                <MenuItem
                  key={option.id}
                  role="option"
                  aria-selected={isSelected}
                  selected={isSelected}
                  disabled={option.disabled}
                  disableRipple
                  className="ui-option"
                  onClick={() => pick(option.id)}
                >
                  <span className="ui-option-label">{option.label}</span>
                  {isSelected && <Icon icon={Check} size="sm" className="ui-option-check" />}
                </MenuItem>
              );
            })
          )}
        </MenuList>
      </Popover>
      <OtherText
        show={!!otherOptionId && selected === otherOptionId}
        value={otherValue}
        onChange={onOtherChange}
        disabled={field.disabled}
      />
    </div>
  );
}

const filterByLabel = createFilterOptions<SelectOption>({
  stringify: (option) => option.label,
  ignoreCase: true,
});

/**
 * Text input with a filtered option list on the combobox pattern (MUI's Autocomplete): the list
 * opens on focus, filters as the person types, and a server search shows its answers unfiltered.
 */
export function Combobox({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  allowsCustomValue = false,
  onInputChange,
  serverSearch = false,
  ...field
}: ComboboxProps) {
  const { messages } = useUi();
  const ids = useFieldIds(field.id);
  const [open, setOpen] = useState(false);
  const find = (id: string | null | undefined) =>
    id === undefined ? undefined : (options.find((o) => o.id === id) ?? null);
  const describedBy = [field.helper && ids.helperId, field.error && ids.errorId]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={fieldClass(field)}>
      <NativeFieldLabel {...field} htmlFor={ids.inputId} />
      <Autocomplete<SelectOption, false, false, boolean>
        id={ids.inputId}
        options={options}
        {...(value === undefined
          ? { defaultValue: find(defaultValue) ?? null }
          : { value: find(value) ?? null })}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        openOnFocus
        // the list renders next to the input, so a surrounding dialog's modality never hides it
        disablePortal
        freeSolo={allowsCustomValue}
        disabled={field.disabled}
        readOnly={field.readOnly || field.locked}
        getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
        isOptionEqualToValue={(a, b) =>
          typeof b === 'object' && b !== null ? a.id === b.id : a.label === b
        }
        getOptionDisabled={(option) => !!option.disabled}
        filterOptions={serverSearch ? (all) => all : filterByLabel}
        noOptionsText={messages.field.noResults}
        onChange={(_, next) =>
          onChange?.(next !== null && typeof next === 'object' ? next.id : null)
        }
        onInputChange={(_, text) => onInputChange?.(text)}
        slotProps={{
          paper: { className: 'ui-popover' },
          listbox: { className: 'ui-listbox' },
        }}
        renderOption={({ key, className, ...props }, option, state) => (
          <li key={key} {...props} className={cx(className, 'ui-option')}>
            <span className="ui-option-label">{option.label}</span>
            {state.selected && <Icon icon={Check} size="sm" className="ui-option-check" />}
          </li>
        )}
        renderInput={(params) => (
          <div
            ref={params.slotProps.input.ref}
            onMouseDown={params.slotProps.input.onMouseDown}
            className="ui-input-wrap"
          >
            <input
              {...params.slotProps.htmlInput}
              className="ui-input"
              name={field.name}
              placeholder={placeholder}
              required={field.required}
              aria-describedby={describedBy || undefined}
              aria-invalid={field.error ? true : undefined}
            />
            <button
              type="button"
              tabIndex={-1}
              className="ui-input-button"
              aria-label={messages.field.showOptions}
              disabled={field.disabled}
              onClick={() => setOpen((now) => !now)}
            >
              <Icon icon={ChevronDown} />
            </button>
          </div>
        )}
      />
      <NativeFieldFooter {...field} ids={ids} />
    </div>
  );
}
