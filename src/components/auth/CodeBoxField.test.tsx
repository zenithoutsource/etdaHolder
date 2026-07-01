import { fireEvent, render, screen } from '@testing-library/react-native'

import { CodeBoxField } from './CodeBoxField'

describe('CodeBoxField', () => {
  test('normalizes pasted text to digits only', () => {
    const onChange = jest.fn()

    render(<CodeBoxField value="" onChange={onChange} autoFocus={false} />)

    fireEvent.changeText(screen.getByTestId('code-box-field-input'), 'Code: 98-76-54')

    expect(onChange).toHaveBeenCalledWith('987654')
  })

  test('limits output to configured length', () => {
    const onChange = jest.fn()

    render(<CodeBoxField value="" onChange={onChange} length={4} autoFocus={false} />)

    fireEvent.changeText(screen.getByTestId('code-box-field-input'), '123456')

    expect(onChange).toHaveBeenCalledWith('1234')
  })
})
