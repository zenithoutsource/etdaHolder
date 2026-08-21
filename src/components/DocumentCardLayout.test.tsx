import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { DocumentCardLayout } from './DocumentCardLayout'

describe('DocumentCardLayout', () => {
  test('renders the shared document-card structure with a flex banner', () => {
    render(
      <DocumentCardLayout
        primaryColor="#002887"
        banner={<Text>DOCUMENT</Text>}
        hero={<Text>Hero content</Text>}
        leftColumn={<Text>Left content</Text>}
        rightColumn={<Text>Right content</Text>}
      />,
    )

    expect(screen.getByTestId('document-card-layout')).toBeTruthy()
    expect(screen.getByTestId('document-card-banner')).toBeTruthy()
    expect(screen.getByTestId('document-card-hero')).toBeTruthy()
    expect(screen.getByTestId('document-card-left-column')).toBeTruthy()
    expect(screen.getByTestId('document-card-divider')).toBeTruthy()
    expect(screen.getByTestId('document-card-right-column')).toBeTruthy()
    expect(screen.getByText('DOCUMENT')).toBeTruthy()
    expect(screen.getByText('Hero content')).toBeTruthy()
    expect(screen.getByText('Left content')).toBeTruthy()
    expect(screen.getByText('Right content')).toBeTruthy()

    expect(screen.getByTestId('document-card-banner').props.className).toContain('flex-row')
    expect(screen.getByTestId('document-card-banner').props.style).toEqual(
      expect.objectContaining({ width: '100%', backgroundColor: '#002887' }),
    )
    expect(screen.getByTestId('document-card-banner-primary').props.style).toEqual(
      expect.objectContaining({ backgroundColor: '#002887' }),
    )
    expect(screen.queryByTestId('document-card-banner-secondary')).toBeNull()
    expect(screen.getByTestId('document-card-banner').props.className).toContain('items-center')
    expect(screen.queryByTestId('document-card-banner-action')).toBeNull()
  })

  test('renders an optional banner action aligned in the header', () => {
    render(
      <DocumentCardLayout
        primaryColor="#002887"
        banner={<Text>DOCUMENT</Text>}
        bannerAction={<Text>Menu</Text>}
        hero={<Text>Hero content</Text>}
        leftColumn={<Text>Left content</Text>}
        rightColumn={<Text>Right content</Text>}
      />,
    )

    expect(screen.getByTestId('document-card-banner-action')).toBeTruthy()
    expect(screen.getByText('Menu')).toBeTruthy()
    expect(screen.getByTestId('document-card-banner').props.className).toContain('items-center')
  })

  test('applies an optional columns class name', () => {
    render(
      <DocumentCardLayout
        primaryColor="#002887"
        banner={<Text>DOCUMENT</Text>}
        hero={<Text>Hero content</Text>}
        leftColumn={<Text>Left content</Text>}
        rightColumn={<Text>Right content</Text>}
        columnsClassName="flex-row px-4 pt-4 pb-12"
      />,
    )

    expect(screen.getByTestId('document-card-columns').props.className).toBe(
      'flex-row px-4 pt-4 pb-12',
    )
  })
})
