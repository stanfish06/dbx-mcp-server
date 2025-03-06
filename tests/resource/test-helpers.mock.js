// Mock test-helpers.ts for resource tests
export const getTestFolderURI = jest.fn().mockReturnValue('dbx://mock-folder');
export const getTestFileURI = jest.fn().mockReturnValue('dbx://mock-folder/mock-file.txt');
export const getTestResourceContent = jest.fn().mockReturnValue('Test resource content');

// Add the missing helper functions
export const createMockContent = jest.fn().mockImplementation((text, encoding = 'utf-8') => {
    return {
        content: [{
            text,
            encoding
        }]
    };
});

export const createMockMetadata = jest.fn().mockImplementation((data) => {
    return {
        content: [{
            text: JSON.stringify(data)
        }]
    };
});

export const createMockFilesList = jest.fn().mockImplementation((files) => {
    return {
        content: [{
            text: JSON.stringify(files)
        }]
    };
});

export const getMockedApi = jest.fn().mockReturnValue({});
