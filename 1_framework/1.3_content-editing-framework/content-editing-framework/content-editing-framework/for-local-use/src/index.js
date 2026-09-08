// Import interactive examples from specified folders
const exampleModules = import.meta.glob('./examples/**/*.jsx', { eager: true });

// Process modules into component objects
const EXAMPLE_COMPONENTS = processModulesToComponents(exampleModules);

// Function to extract and format title from filename
function formatTitle(filename) {
    // Remove file extension if present
    const nameWithoutExtension = filename.replace(/\.[^/.]+$/, "");

    // Handle special case for summary file
    if (nameWithoutExtension === 'summary') {
        return 'Summary';
    }

    // Remove leading number and dash (e.g., "01-" -> "")
    const withoutNumber = nameWithoutExtension.replace(/^\d+-/, "");
    console.log(withoutNumber)
    // Split by dashes, capitalize each word, and join with spaces
    return withoutNumber
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Function to extract number from filename for sorting
function getFileNumber(filePath) {
    const filename = filePath.split('/').pop(); // Get filename from path
    const match = filename.match(/^(\d+)-/); // Match leading number pattern
    return match ? parseInt(match[1]) : Infinity; // Summary files get Infinity (sorted last)
}

// Generic function to process imported modules into component object
function processModulesToComponents(modules) {
    // Sort files by number (01, 02, 03, ..., summary)
    const sortedFilePaths = Object.keys(modules).sort((a, b) => {
        return getFileNumber(a) - getFileNumber(b);
    });

    // Create array with titles and components
    const components = sortedFilePaths.map(filePath => {
        const filename = filePath.split('/').pop().replace('.jsx', ''); // Extract filename without extension
        const title = formatTitle(filename);
        const component = modules[filePath].default;

        return {
            title,
            component
        };
    });

    // Convert array to object with titles as keys
    return components.reduce((acc, { title, component }) => {
        acc[title] = component;
        return acc;
    }, {});
}

console.log("modules");
console.log(exampleModules);

console.log("components");
console.log(EXAMPLE_COMPONENTS);

// Export component collections
export { EXAMPLE_COMPONENTS };