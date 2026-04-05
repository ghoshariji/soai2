import React from 'react';
import Input from './Input';

export type CustomInputProps = React.ComponentProps<typeof Input>;

/** Form input with max-width (~90%) and centered — use on auth and narrow layouts. */
const CustomInput: React.FC<CustomInputProps> = (props) => (
  <Input layout="constrained" {...props} />
);

export default React.memo(CustomInput);
