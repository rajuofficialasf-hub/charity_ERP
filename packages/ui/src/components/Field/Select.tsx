'use client';

import { useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  Autocomplete,
  Button as AriaButton,
  ComboBox as AriaComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
  Select as AriaSelect,
  SelectValue,
  useFilter,
  type Key,
} from 'react-aria-components';
import { useUi } from '../../provider/UiProvider.js';
import { Icon } from '../Icon/Icon.js';
import { FieldFooter, FieldLabel, fieldClass, type FieldBaseProps } from './FieldParts.js';
import { TextField } from './TextField.js';

export interface SelectOption {
  id: string;
  label: string;
  disabled?: boolean;
}

/** BD-14: an "other" option opens a text box inside the same field. */
export interface OtherOptionProps {
  /** Id of the option that means "other" (অন্যান্য). */
  otherOptionId?: string;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
}

export interface SelectProps extends FieldBaseProps, OtherOptionProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string | null) => void;
  placeholder?: string;
  /** Search box in the list; on by default when there are more than 10 options (DESIGN_SYSTEM 5.4). */
  searchable?: boolean;
}

function OptionList({ options }: { options: SelectOption[] }) {
  return (
    <>
      {options.map((option) => (
        <ListBoxItem
          key={option.id}
          id={option.id}
          textValue={option.label}
          isDisabled={option.disabled}
          className="ui-option"
        >
          {({ isSelected }) => (
            <>
              <span className="ui-option-label">{option.label}</span>
              {isSelected && <Icon icon={Check} size="sm" className="ui-option-check" />}
            </>
          )}
        </ListBoxItem>
      ))}
    </>
  );
}

function OtherText({
  show,
  value,
  onChange,
  disabled,
}: {
  show: boolean;
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
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

/** Single select on the APG listbox pattern; searchable with many options. */
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
  const { contains } = useFilter({ sensitivity: 'base' });
  const withSearch = searchable ?? options.length > 10;
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const selected = value === undefined ? inner : value;
  return (
    <div className={fieldClass({ ...field, className: undefined })} data-control="select">
      <AriaSelect
        className="ui-field-inner"
        id={field.id}
        name={field.name}
        selectedKey={selected}
        onSelectionChange={(key: Key | null) => {
          const id = key === null ? null : String(key);
          setInner(id);
          onChange?.(id);
        }}
        isRequired={field.required}
        isInvalid={!!field.error}
        isDisabled={field.disabled || field.readOnly || field.locked}
        placeholder={placeholder ?? messages.field.selectPlaceholder}
        validationBehavior="aria"
      >
        <FieldLabel {...field} />
        <AriaButton className="ui-input ui-select-trigger">
          <SelectValue className="ui-select-value" />
          <Icon icon={ChevronDown} />
        </AriaButton>
        <FieldFooter {...field} />
        <Popover className="ui-popover" placement="bottom start">
          {withSearch ? (
            <Autocomplete filter={contains}>
              <SearchField
                className="ui-popover-search"
                aria-label={messages.field.search}
                autoFocus
              >
                <Icon icon={Search} size="sm" />
                <Input className="ui-input" placeholder={messages.field.search} />
              </SearchField>
              <ListBox
                className="ui-listbox"
                renderEmptyState={() => (
                  <p className="ui-listbox-empty">{messages.field.noResults}</p>
                )}
              >
                <OptionList options={options} />
              </ListBox>
            </Autocomplete>
          ) : (
            <ListBox className="ui-listbox">
              <OptionList options={options} />
            </ListBox>
          )}
        </Popover>
      </AriaSelect>
      <OtherText
        show={!!otherOptionId && selected === otherOptionId}
        value={otherValue}
        onChange={onOtherChange}
        disabled={field.disabled}
      />
    </div>
  );
}

export interface ComboboxProps extends FieldBaseProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string | null) => void;
  placeholder?: string;
  /** Allows text that is not one of the options (reported through onInputChange). */
  allowsCustomValue?: boolean;
  onInputChange?: (text: string) => void;
}

/** Text input with a filtered option list on the APG combobox pattern. */
export function Combobox({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  allowsCustomValue,
  onInputChange,
  ...field
}: ComboboxProps) {
  const { messages } = useUi();
  const { contains } = useFilter({ sensitivity: 'base' });
  return (
    <AriaComboBox
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      selectedKey={value === undefined ? undefined : value}
      defaultSelectedKey={defaultValue ?? undefined}
      onSelectionChange={(key: Key | null) => onChange?.(key === null ? null : String(key))}
      onInputChange={onInputChange}
      defaultFilter={contains}
      allowsCustomValue={allowsCustomValue}
      menuTrigger="focus"
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      validationBehavior="aria"
    >
      <FieldLabel {...field} />
      <div className="ui-input-wrap">
        <Input className="ui-input" placeholder={placeholder} />
        <AriaButton className="ui-input-button" aria-label={messages.field.showOptions}>
          <Icon icon={ChevronDown} />
        </AriaButton>
      </div>
      <FieldFooter {...field} />
      <Popover className="ui-popover" placement="bottom start">
        <ListBox
          className="ui-listbox"
          renderEmptyState={() => <p className="ui-listbox-empty">{messages.field.noResults}</p>}
        >
          <OptionList options={options} />
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}
