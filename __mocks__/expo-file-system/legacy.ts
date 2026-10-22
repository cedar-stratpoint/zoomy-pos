export const documentDirectory = 'file:///mock/documents/';

export const getInfoAsync = jest.fn().mockResolvedValue({ exists: true });

export const copyAsync = jest.fn().mockResolvedValue(undefined);

export const deleteAsync = jest.fn().mockResolvedValue(undefined);

export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };

export const readAsStringAsync = jest.fn().mockResolvedValue('');
