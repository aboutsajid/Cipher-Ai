import React, { useState } from 'react';
import './App.css';

const App = () => {
  const [selectedCategory, setSelectedCategory] = useState('General');
  const [snippets, setSnippets] = useState({ General: [] });

  const categories = ['General', 'Troubleshooting', 'Quick Fixes'];

  const handleAddSnippet = () => {
    // Logic to add a new snippet
    console.log('Add Snippet');
  };

  return (
    <div className='snippet-desk'>
      <div className='sidebar'>
        <h2>Categories</h2>
        {categories.map(category => (
          <category key={category} onClick={() => setSelectedCategory(category)}className={selectedCategory === category ? 'active' : ''}>{category}</category>
        ))}
      </div>
      <div className='main-content'>
        <h2>{selectedCategory} Snippets</h2>
        <ul className='snippet-list'>
          {snippets[selectedCategory].map((snippet, index) => (
            <li key={index} className='snippet-item'>{snippet}</li>
          ))}
        </ul>
        <button onClick={handleAddSnippet} className='add-snippet-button'>Add Snippet</button>
      </div>
    </div>
  );
};

export default App;