import {
  getWellSetForMultichannel,
  getSelectedWellsCommonValues,
} from '../utils'

describe('getWellSetForMultichannel (integration test)', () => {
  test('96-flat', () => {
    const labwareName = '96-flat'
    expect(
      getWellSetForMultichannel(labwareName, 'A1')
    ).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'])

    expect(
      getWellSetForMultichannel(labwareName, 'B1')
    ).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'])

    expect(
      getWellSetForMultichannel(labwareName, 'H1')
    ).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'])

    expect(
      getWellSetForMultichannel(labwareName, 'A2')
    ).toEqual(['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2'])
  })

  test('invalid well', () => {
    const labwareName = '96-flat'
    expect(
      getWellSetForMultichannel(labwareName, 'A13')
    ).toBeFalsy()
  })

  test('trough-12row', () => {
    const labwareName = 'trough-12row'
    expect(
      getWellSetForMultichannel(labwareName, 'A1')
    ).toEqual(['A1', 'A1', 'A1', 'A1', 'A1', 'A1', 'A1', 'A1'])

    expect(
      getWellSetForMultichannel(labwareName, 'A2')
    ).toEqual(['A2', 'A2', 'A2', 'A2', 'A2', 'A2', 'A2', 'A2'])
  })

  test('384-plate', () => {
    const labwareName = '384-plate'
    expect(
      getWellSetForMultichannel(labwareName, 'C1')
    ).toEqual(['A1', 'C1', 'E1', 'G1', 'I1', 'K1', 'M1', 'O1'])

    expect(
      getWellSetForMultichannel(labwareName, 'F2')
    ).toEqual(['B2', 'D2', 'F2', 'H2', 'J2', 'L2', 'N2', 'P2'])
  })

  test('missing labware definition', () => {
    const labwareName = 'custom-labware-that-does-not-have-defz'
    console.warn = jest.fn() // TODO Better way to suppress console.warn?

    expect(
      getWellSetForMultichannel(labwareName, 'A1')
    ).toBeFalsy()
  })
})

let wellContents
beforeEach(() => {
  wellContents = {
    A1: {ingreds: {'ingred1': {volume: 115}}},
    A2: {ingreds: {'ingred1': {volume: 111}}},
    A3: {ingreds: {'ingred2': {volume: 155}}},
    A4: {ingreds: {'ingred2': {volume: 105}, 'ingred1': {volume: 10}}},
    // rest empty
  }
})

describe('getSelectedWellsCommonValues', () => {
  test('only selected well has liquid', () => {
    const selectedWells = {A1: 'A1'}

    const result = getSelectedWellsCommonValues(wellContents, selectedWells)

    expect(result.commonSelectedLiquidId).toBe('ingred1')
  })

  test('no selected labware', () => {
    const selectedWells = {A1: 'A1'}

    const result = getSelectedWellsCommonValues({}, selectedWells)

    expect(result.commonSelectedLiquidId).toBe(null)
  })

  test('all selected wells same ingred: return ingred group id', () => {
    const selectedWells = {A1: 'A1', 'A2': 'A2'}

    const result = getSelectedWellsCommonValues(wellContents, selectedWells)

    expect(result.commonSelectedLiquidId).toBe('ingred1')
  })

  test('2 well different ingreds: return null', () => {
    const selectedWells = {'A2': 'A2', A3: 'A3'}

    const result = getSelectedWellsCommonValues(wellContents, selectedWells)

    expect(result.commonSelectedLiquidId).toBe(null)
  })

  test('2 well one empty: return null', () => {
    const selectedWells = {'A2': 'A2', A6: 'A6'}

    const result = getSelectedWellsCommonValues(wellContents, selectedWells)

    expect(result.commonSelectedLiquidId).toBe(null)
  })

  test('1 well mixed ingreds: return null', () => {
    const selectedWells = {'A4': 'A4'}

    const result = getSelectedWellsCommonValues(wellContents, selectedWells)

    expect(result.commonSelectedLiquidId).toBe(null)
  })
})