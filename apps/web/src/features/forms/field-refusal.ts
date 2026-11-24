/**
 * A refusal the screen has already put under the question it is about: the renderer stops there
 * and says nothing more above the form, so the person reads one message, at the field.
 */
export class FieldRefusal extends Error {
  override name = 'FieldRefusal';
}
