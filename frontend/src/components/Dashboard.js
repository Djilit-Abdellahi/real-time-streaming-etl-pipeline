import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { 
  FaSort, FaSortUp, FaSortDown, FaExternalLinkAlt, FaInfoCircle, 
  FaTimes, FaSync, FaHistory, FaExclamationTriangle, FaSearch,
  FaChevronDown, FaChevronUp, FaFilter, FaColumns, FaClipboard, 
  FaGlobe, FaServer, FaList, FaCalendarAlt
} from 'react-icons/fa';

const Dashboard = forwardRef((props, ref) => {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'updated_at', direction: 'desc' });
  const [expandedDomain, setExpandedDomain] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [detailedDomain, setDetailedDomain] = useState(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState({});
  const previousDomainsRef = useRef([]);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({
    hasHttp: null,
    inTranco: null,
    updatedRecently: false
  });
  const [showFilters, setShowFilters] = useState(false);

  // Theme state
  const [theme, setTheme] = useState('light');
  
  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState({
    domain_name: true,
    ip_addresses: true,
    tranco_rank: true,
    has_http_service: true,
    page_title: true,
    actions: true
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [domainsPerPage, setDomainsPerPage] = useState('All');
  const [pageSizeOptions] = useState([10, 25, 50, 100, 'All']);

  // Function to fetch domains from the API
  const fetchDomains = async () => {
    try {
      setLoading(true);
      // Request domains with the maximum allowed page size
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/domains?page_size=100`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();

      // Extract domains from the response
      const domainItems = data.items || data;

      // Check for updated domains
      if (previousDomainsRef.current.length > 0) {
        const updatedDomains = {};

        domainItems.forEach(newDomain => {
          const prevDomain = previousDomainsRef.current.find(d => d.domain_name === newDomain.domain_name);

          if (prevDomain && new Date(newDomain.updated_at) > new Date(prevDomain.updated_at)) {
            // This domain has been updated
            updatedDomains[newDomain.domain_name] = true;

            // Auto-expire the updated status after 30 seconds
            setTimeout(() => {
              setRecentlyUpdated(prev => {
                const updated = {...prev};
                delete updated[newDomain.domain_name];
                return updated;
              });
            }, 30000);
          }
        });

        // Update the recently updated domains
        setRecentlyUpdated(prev => ({...prev, ...updatedDomains}));
      }

      // Update domains and reference
      setDomains(domainItems);
      previousDomainsRef.current = domainItems;
      setLoading(false);
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // Expose the refreshDomains method to parent components
  useImperativeHandle(ref, () => ({
    refreshDomains: fetchDomains
  }));

  useEffect(() => {
    fetchDomains();

    // Set up polling to refresh data every 30 seconds
    const intervalId = setInterval(fetchDomains, 30000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <FaSort className="inline ml-1 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' ? 
      <FaSortUp className="inline ml-1 text-blue-500" /> : 
      <FaSortDown className="inline ml-1 text-blue-500" />;
  };

  // Apply filters to domains
  const filteredDomains = Array.isArray(domains) ? domains.filter(domain => {
    // Search term filter
    if (searchTerm && !domain.domain_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(domain.page_title && domain.page_title.toLowerCase().includes(searchTerm.toLowerCase()))) {
      return false;
    }
    
    // HTTP service filter
    if (filterOptions.hasHttp !== null) {
      if (filterOptions.hasHttp !== domain.has_http_service) {
        return false;
      }
    }
    
    // Tranco list filter
    if (filterOptions.inTranco !== null) {
      const isInTranco = domain.tranco_rank !== null && domain.tranco_rank !== undefined;
      if (filterOptions.inTranco !== isInTranco) {
        return false;
      }
    }
    
    // Recently updated filter
    if (filterOptions.updatedRecently && !recentlyUpdated[domain.domain_name]) {
      return false;
    }
    
    return true;
  }) : [];

  const sortedDomains = [...filteredDomains].sort((a, b) => {
    if (a[sortConfig.key] === null) return 1;
    if (b[sortConfig.key] === null) return -1;

    if (sortConfig.key === 'domain_name' || sortConfig.key === 'page_title') {
      if (sortConfig.direction === 'asc') {
        return a[sortConfig.key].localeCompare(b[sortConfig.key]);
      }
      return b[sortConfig.key].localeCompare(a[sortConfig.key]);
    }

    if (sortConfig.key === 'ip_addresses') {
      const aCount = (a.ip_addresses.ipv4?.length || 0) + (a.ip_addresses.ipv6?.length || 0);
      const bCount = (b.ip_addresses.ipv4?.length || 0) + (b.ip_addresses.ipv6?.length || 0);

      if (sortConfig.direction === 'asc') {
        return aCount - bCount;
      }
      return bCount - aCount;
    }

    if (sortConfig.direction === 'asc') {
      return a[sortConfig.key] - b[sortConfig.key];
    }
    return b[sortConfig.key] - a[sortConfig.key];
  });

  // Get current domains for pagination
  const isShowingAll = domainsPerPage === 'All';
  const indexOfLastDomain = isShowingAll ? sortedDomains.length : currentPage * Number(domainsPerPage);
  const indexOfFirstDomain = isShowingAll ? 0 : indexOfLastDomain - Number(domainsPerPage);
  const currentDomains = sortedDomains.slice(indexOfFirstDomain, indexOfLastDomain);

  // Calculate total pages
  const totalPages = isShowingAll ? 1 : Math.ceil(sortedDomains.length / Number(domainsPerPage));

  // Change page
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Change page size
  const changePageSize = (size) => {
    setDomainsPerPage(size);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Go to next page
  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Go to previous page
  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const toggleExpandDomain = (domainName) => {
    if (expandedDomain === domainName) {
      setExpandedDomain(null);
    } else {
      setExpandedDomain(domainName);
    }
  };

  const openDetailModal = (e, domainName) => {
    e.stopPropagation(); // Prevent triggering the row click event
    const domain = domains.find(d => d.domain_name === domainName);
    setDetailedDomain(domain);
    setShowModal(true);
  };

  const closeDetailModal = () => {
    setShowModal(false);
    setDetailedDomain(null);
  };

  // Toggle column visibility
  const toggleColumnVisibility = (column) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setFilterOptions({
      hasHttp: null,
      inTranco: null,
      updatedRecently: false
    });
  };

  // Toggle theme
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Copy domain data to clipboard
  const copyToClipboard = (domainData) => {
    const data = JSON.stringify(domainData, null, 2);
    navigator.clipboard.writeText(data);
    // Show toast notification
    alert('Domain data copied to clipboard!');
  };

  const reanalyzeDomain = async (e, domainName) => {
    e.stopPropagation(); // Prevent triggering the row click event

    try {
      // Set loading state for this specific domain
      setRecentlyUpdated(prev => ({
        ...prev,
        [domainName]: 'loading'
      }));

      // Call the API to reanalyze the domain
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/scrape-url?url=${encodeURIComponent(domainName)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Parse the response to get the updated domain data
      await response.json(); // We don't need to use this response as we'll fetch all domains next

      // Fetch the domains list with the maximum allowed page size
      const domainsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/domains?page_size=100`);
      if (!domainsResponse.ok) {
        throw new Error(`HTTP error! Status: ${domainsResponse.status}`);
      }

      const data = await domainsResponse.json();
      setDomains(data);

      // Mark this domain as recently updated
      setRecentlyUpdated(prev => ({
        ...prev,
        [domainName]: true
      }));

      // Show a temporary success message in the console
      console.log(`Successfully updated ${domainName} with fresh data`);

      // Auto-expire the updated status after 30 seconds
      setTimeout(() => {
        setRecentlyUpdated(prev => {
          const updated = {...prev};
          delete updated[domainName];
          return updated;
        });
      }, 30000);

    } catch (error) {
      console.error('Error reanalyzing domain:', error);

      // Set error state for this domain
      setRecentlyUpdated(prev => ({
        ...prev,
        [domainName]: 'error'
      }));

      // Auto-clear the error state after 5 seconds
      setTimeout(() => {
        setRecentlyUpdated(prev => {
          const updated = {...prev};
          delete updated[domainName];
          return updated;
        });
      }, 5000);
    }
  };

  // Dynamic theme classes
  const themeClasses = theme === 'dark' ? {
    background: 'bg-gray-900',
    text: 'text-gray-100',
    panel: 'bg-gray-800',
    border: 'border-gray-700',
    header: 'bg-gray-800',
    button: 'bg-blue-600 hover:bg-blue-700',
    input: 'bg-gray-700 border-gray-600 text-white',
    tableHeader: 'bg-gray-800 text-gray-300',
    tableRow: 'bg-gray-800 border-gray-700 hover:bg-gray-700',
    highlightRow: 'bg-blue-900',
    modal: 'bg-gray-800 border-gray-700'
  } : {
    background: 'bg-gray-50',
    text: 'text-gray-900',
    panel: 'bg-white',
    border: 'border-gray-200',
    header: 'bg-gray-50',
    button: 'bg-blue-500 hover:bg-blue-600',
    input: 'bg-white border-gray-300 text-gray-900',
    tableHeader: 'bg-gray-50 text-gray-500',
    tableRow: 'bg-white border-gray-200 hover:bg-gray-50',
    highlightRow: 'bg-blue-50',
    modal: 'bg-white border-gray-200'
  };

  if (loading) {
    return (
      <div className={`${themeClasses.panel} shadow-md rounded-lg p-6 max-w-full transition-colors duration-200`}>
        <h2 className={`text-xl font-semibold mb-4 ${themeClasses.text}`}>Domain Analysis Results</h2>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          </div>
          <span className={`text-lg ${themeClasses.text} mb-2 animate-pulse`}>Loading domain data...</span>
          <p className="text-sm text-gray-500 mb-6">Fetching the latest metadata for analysis</p>
          <div className="mt-4 w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${themeClasses.panel} shadow-md rounded-lg p-6 max-w-full transition-colors duration-200`}>
        <h2 className={`text-xl font-semibold mb-4 ${themeClasses.text}`}>Domain Analysis Results</h2>
        <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-md flex items-start">
          <div className="mr-4 flex-shrink-0 mt-1">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Error Loading Domains</h3>
            <p className="mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClasses.panel} shadow-lg rounded-lg transition-colors duration-200 overflow-hidden`}>
      {/* Header */}
      <div className={`flex flex-col sm:flex-row justify-between items-center p-6 ${themeClasses.border} border-b`}>
        <div className="flex items-center mb-4 sm:mb-0">
          <div className="mr-3">
            <FaGlobe className={`text-blue-500 text-2xl`} />
          </div>
          <div>
            <h2 className={`text-xl font-bold ${themeClasses.text}`}>Domain Analysis Dashboard</h2>
            <p className="text-sm text-gray-500">Monitor and analyze domain metadata</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={toggleTheme}
            className={`p-2 rounded-md bg-gray-200 hover:bg-gray-300 transition-colors duration-200`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          
          <button 
            onClick={fetchDomains} 
            className={`flex items-center px-4 py-2 ${themeClasses.button} text-white rounded-md transition-colors duration-200`}
          >
            <FaSync className="mr-2" /> Refresh Data
          </button>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className={`p-4 ${themeClasses.border} border-b`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaSearch className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search domains or page titles..."
              className={`pl-10 pr-4 py-2 rounded-md w-full ${themeClasses.input} border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 border ${themeClasses.border} rounded-md flex items-center hover:bg-gray-100 transition-colors duration-200`}
            >
              <FaFilter className="mr-2 text-blue-500" />
              Filters
              {showFilters ? <FaChevronUp className="ml-2" /> : <FaChevronDown className="ml-2" />}
            </button>
            
            <button
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className={`px-4 py-2 border ${themeClasses.border} rounded-md flex items-center hover:bg-gray-100 transition-colors duration-200`}
            >
              <FaColumns className="mr-2 text-blue-500" />
              Columns
              {showColumnSelector ? <FaChevronUp className="ml-2" /> : <FaChevronDown className="ml-2" />}
            </button>
          </div>
        </div>
        
        {/* Filter Options */}
        {showFilters && (
          <div className={`mt-4 p-4 ${themeClasses.border} border rounded-md grid grid-cols-1 md:grid-cols-3 gap-4`}>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text} mb-2`}>HTTP Service</label>
              <select
                value={filterOptions.hasHttp === null ? 'all' : filterOptions.hasHttp ? 'yes' : 'no'}
                onChange={(e) => {
                  const value = e.target.value;
                  setFilterOptions(prev => ({
                    ...prev,
                    hasHttp: value === 'all' ? null : value === 'yes'
                  }));
                }}
                className={`w-full ${themeClasses.input} border rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500`}
              >
                <option value="all">All Domains</option>
                <option value="yes">Has HTTP Service</option>
                <option value="no">No HTTP Service</option>
              </select>
            </div>
            
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text} mb-2`}>Tranco Ranking</label>
              <select
                value={filterOptions.inTranco === null ? 'all' : filterOptions.inTranco ? 'yes' : 'no'}
                onChange={(e) => {
                  const value = e.target.value;
                  setFilterOptions(prev => ({
                    ...prev,
                    inTranco: value === 'all' ? null : value === 'yes'
                  }));
                }}
                className={`w-full ${themeClasses.input} border rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500`}
              >
                <option value="all">All Domains</option>
                <option value="yes">In Tranco List</option>
                <option value="no">Not in Tranco List</option>
              </select>
            </div>
            
            <div className="flex items-center">
              <label className={`block text-sm font-medium ${themeClasses.text} mr-2`}>Recently Updated</label>
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={filterOptions.updatedRecently}
                  onChange={() => {
                    setFilterOptions(prev => ({
                      ...prev,
                      updatedRecently: !prev.updatedRecently
                    }));
                  }}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            <div className="md:col-span-3 flex justify-end">
              <button
                onClick={resetFilters}
                className={`px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200`}
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
        
        {/* Column Selector */}
        {showColumnSelector && (
          <div className={`mt-4 p-4 ${themeClasses.border} border rounded-md`}>
            <h3 className={`text-sm font-medium ${themeClasses.text} mb-3`}>Toggle Columns</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                  checked={visibleColumns.domain_name}
                  onChange={() => toggleColumnVisibility('domain_name')}
                  disabled={true} // Domain name should always be visible
                />
                <span className={`ml-2 text-sm ${themeClasses.text}`}>Domain</span>
              </label>
              
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                  checked={visibleColumns.ip_addresses}
                  onChange={() => toggleColumnVisibility('ip_addresses')}
                />
                <span className={`ml-2 text-sm ${themeClasses.text}`}>IP Addresses</span>
              </label>
              
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                  checked={visibleColumns.tranco_rank}
                  onChange={() => toggleColumnVisibility('tranco_rank')}
                />
                <span className={`ml-2 text-sm ${themeClasses.text}`}>Tranco Rank</span>
              </label>
              
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                  checked={visibleColumns.has_http_service}
                  onChange={() => toggleColumnVisibility('has_http_service')}
                />
                <span className={`ml-2 text-sm ${themeClasses.text}`}>HTTP Service</span>
              </label>
              
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                  checked={visibleColumns.page_title}
                  onChange={() => toggleColumnVisibility('page_title')}
                />
                <span className={`ml-2 text-sm ${themeClasses.text}`}>Page Title</span>
              </label>
              
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                  checked={visibleColumns.actions}
                  onChange={() => toggleColumnVisibility('actions')}
                />
                <span className={`ml-2 text-sm ${themeClasses.text}`}>Actions</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {domains.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-blue-100 text-blue-500 mb-6">
            <FaGlobe className="h-12 w-12" />
          </div>
          <h3 className={`text-xl font-semibold ${themeClasses.text} mb-2`}>No domains analyzed yet</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            Enter a URL in the search box above to extract and analyze all domains found on that page.
          </p>
          <button
            onClick={() => window.open('https://rimnow.com', '_blank')}
            className={`inline-flex items-center px-5 py-2.5 ${themeClasses.button} text-white rounded-md shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
          >
            <FaExternalLinkAlt className="mr-2" /> Visit rimnow.com
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Active Filters Summary */}
          {(searchTerm || filterOptions.hasHttp !== null || filterOptions.inTranco !== null || filterOptions.updatedRecently) && (
            <div className="px-6 py-3 flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${themeClasses.text}`}>Active Filters:</span>
              
              {searchTerm && (
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'}`}>
                  Search: "{searchTerm}"
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="ml-1 focus:outline-none"
                  >
                    <FaTimes className="h-3 w-3" />
                  </button>
                </div>
              )}
              
              {filterOptions.hasHttp !== null && (
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'}`}>
                  HTTP: {filterOptions.hasHttp ? 'Yes' : 'No'}
                  <button 
                    onClick={() => setFilterOptions(prev => ({ ...prev, hasHttp: null }))}
                    className="ml-1 focus:outline-none"
                  >
                    <FaTimes className="h-3 w-3" />
                  </button>
                </div>
              )}
              
              {filterOptions.inTranco !== null && (
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'}`}>
                  Tranco List: {filterOptions.inTranco ? 'Yes' : 'No'}
                  <button 
                    onClick={() => setFilterOptions(prev => ({ ...prev, inTranco: null }))}
                    className="ml-1 focus:outline-none"
                  >
                    <FaTimes className="h-3 w-3" />
                  </button>
                </div>
              )}
              
              {filterOptions.updatedRecently && (
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'}`}>
                  Recently Updated
                  <button 
                    onClick={() => setFilterOptions(prev => ({ ...prev, updatedRecently: false }))}
                    className="ml-1 focus:outline-none"
                  >
                    <FaTimes className="h-3 w-3" />
                  </button>
                </div>
              )}
              
              <button
                onClick={resetFilters}
                className={`text-xs text-gray-500 hover:text-gray-700 ml-auto transition-colors duration-200`}
              >
                Clear All
              </button>
            </div>
          )}
          
          {/* Statistics Summary */}
          <div className="px-6 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-blue-50'} transition-colors duration-200`}>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-blue-600' : 'bg-blue-100'}`}>
                  <FaGlobe className="text-blue-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Total Domains</p>
                  <p className={`text-2xl font-semibold ${themeClasses.text}`}>{domains.length}</p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-green-50'} transition-colors duration-200`}>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-green-600' : 'bg-green-100'}`}>
                  <FaServer className="text-green-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">With HTTP Service</p>
                  <p className={`text-2xl font-semibold ${themeClasses.text}`}>
                    {domains.filter(d => d.has_http_service).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-purple-50'} transition-colors duration-200`}>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-purple-600' : 'bg-purple-100'}`}>
                  <FaList className="text-purple-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">In Tranco List</p>
                  <p className={`text-2xl font-semibold ${themeClasses.text}`}>
                    {domains.filter(d => d.tranco_rank !== null && d.tranco_rank !== undefined).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-yellow-50'} transition-colors duration-200`}>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-yellow-600' : 'bg-yellow-100'}`}>
                  <FaCalendarAlt className="text-yellow-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Recently Updated</p>
                  <p className={`text-2xl font-semibold ${themeClasses.text}`}>
                    {Object.keys(recentlyUpdated).filter(key => recentlyUpdated[key] === true).length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Domains Table */}
          <div className="px-4 py-2">
            <div className={`overflow-hidden border ${themeClasses.border} rounded-lg`}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className={themeClasses.tableHeader}>
                  <tr>
                    {visibleColumns.domain_name && (
                      <th
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('domain_name')}
                      >
                        <div className="flex items-center">
                          <span>Domain</span>
                          {getSortIcon('domain_name')}
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.ip_addresses && (
                      <th
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('ip_addresses')}
                      >
                        <div className="flex items-center">
                          <span>IP Addresses</span>
                          {getSortIcon('ip_addresses')}
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.tranco_rank && (
                      <th
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('tranco_rank')}
                      >
                        <div className="flex items-center">
                          <span>Tranco Rank</span>
                          {getSortIcon('tranco_rank')}
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.has_http_service && (
                      <th
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('has_http_service')}
                      >
                        <div className="flex items-center">
                          <span>HTTP Service</span>
                          {getSortIcon('has_http_service')}
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.page_title && (
                      <th
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('page_title')}
                      >
                        <div className="flex items-center">
                          <span>Page Title</span>
                          {getSortIcon('page_title')}
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.actions && (
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                
                <tbody className={`divide-y ${themeClasses.border}`}>
                  {currentDomains.map((domain) => (
                    <tr
                      key={domain.domain_name}
                      className={`${recentlyUpdated[domain.domain_name] === true ? themeClasses.highlightRow : themeClasses.tableRow} cursor-pointer transition-colors duration-200`}
                      onClick={() => toggleExpandDomain(domain.domain_name)}
                    >
                      {visibleColumns.domain_name && (
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <div className={`text-sm font-medium ${themeClasses.text} flex items-center`}>
                              {domain.domain_name}
                              {recentlyUpdated[domain.domain_name] === true && (
                                <span className="ml-2 text-xs text-blue-500 flex items-center" title="Recently updated">
                                  <FaHistory className="mr-1" /> Updated
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(domain.updated_at).toLocaleString()}
                            </div>
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.ip_addresses && (
                        <td className="px-6 py-4">
                          <div className={`text-sm ${themeClasses.text}`}>
                            <span className={`px-2 py-1 rounded-full text-xs ${theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'}`}>
                              {((domain.ip_addresses.ipv4?.length || 0) + (domain.ip_addresses.ipv6?.length || 0)) || 0} IPs
                            </span>
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.tranco_rank && (
                        <td className="px-6 py-4">
                          {domain.tranco_rank ? (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'}`}>
                              #{domain.tranco_rank.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500">Not ranked</span>
                          )}
                        </td>
                      )}
                      
                      {visibleColumns.has_http_service && (
                        <td className="px-6 py-4">
                          {domain.has_http_service ? (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'}`}>
                              Yes
                            </span>
                          ) : (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800'}`}>
                              No
                            </span>
                          )}
                        </td>
                      )}
                      
                      {visibleColumns.page_title && (
                        <td className="px-6 py-4">
                          <div className={`text-sm ${themeClasses.text} truncate max-w-xs`} title={domain.page_title || 'N/A'}>
                            {domain.page_title || 'N/A'}
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.actions && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex space-x-3 justify-end">
                            <button
                              onClick={(e) => openDetailModal(e, domain.domain_name)}
                              className={`text-blue-500 hover:text-blue-700 transition-colors duration-200 focus:outline-none`}
                              title="View detailed metadata"
                            >
                              <FaInfoCircle className="text-lg" />
                            </button>
                            
                            <button
                              onClick={(e) => copyToClipboard(domain)}
                              className="text-gray-500 hover:text-gray-700 transition-colors duration-200 focus:outline-none"
                              title="Copy domain data"
                            >
                              <FaClipboard className="text-lg" />
                            </button>
                            
                            <button
                              onClick={(e) => reanalyzeDomain(e, domain.domain_name)}
                              className={`focus:outline-none transition-colors duration-200 ${
                                recentlyUpdated[domain.domain_name] === 'loading' ? 'text-blue-400 animate-pulse' :
                                recentlyUpdated[domain.domain_name] === 'error' ? 'text-red-500' :
                                recentlyUpdated[domain.domain_name] === true ? 'text-green-500' :
                                'text-green-600 hover:text-green-800'
                              }`}
                              title={
                                recentlyUpdated[domain.domain_name] === 'loading' ? 'Updating...' :
                                recentlyUpdated[domain.domain_name] === 'error' ? 'Error updating' :
                                recentlyUpdated[domain.domain_name] === true ? 'Recently updated' :
                                'Reanalyze this domain'
                              }
                              disabled={recentlyUpdated[domain.domain_name] === 'loading'}
                            >
                              {recentlyUpdated[domain.domain_name] === 'error' ? (
                                <FaExclamationTriangle className="text-lg" />
                              ) : (
                                <FaSync className={`text-lg ${recentlyUpdated[domain.domain_name] === 'loading' ? 'animate-spin' : ''}`} />
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Expanded Domain Details */}
          {expandedDomain && (
            <div className={`mx-4 mb-4 p-4 border ${themeClasses.border} rounded-lg ${themeClasses.panel} transition-all duration-300 transform`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className={`text-lg font-medium ${themeClasses.text} flex items-center`}>
                  {expandedDomain}
                  <a
                    href={`http://${expandedDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-500 hover:text-blue-700 transition-colors duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FaExternalLinkAlt />
                  </a>
                </h3>
                <button 
                  onClick={() => setExpandedDomain(null)} 
                  className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
                >
                  <FaTimes />
                </button>
              </div>

              {domains.find(d => d.domain_name === expandedDomain) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} transition-colors duration-200`}>
                    <h4 className={`font-medium mb-3 ${themeClasses.text} flex items-center`}>
                      <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                        <FaServer className="text-blue-500 text-xs" />
                      </span>
                      IP Addresses
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <h5 className={`text-sm font-medium ${themeClasses.text} mb-2`}>IPv4</h5>
                        {domains.find(d => d.domain_name === expandedDomain).ip_addresses.ipv4?.length > 0 ? (
                          <ul className="space-y-1">
                            {domains.find(d => d.domain_name === expandedDomain).ip_addresses.ipv4.map((ip) => (
                              <li key={ip} className={`text-sm ${themeClasses.text} bg-opacity-50 px-3 py-1 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-white'}`}>
                                {ip}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500">None found</p>
                        )}
                      </div>

                      <div>
                        <h5 className={`text-sm font-medium ${themeClasses.text} mb-2`}>IPv6</h5>
                        {domains.find(d => d.domain_name === expandedDomain).ip_addresses.ipv6?.length > 0 ? (
                          <ul className="space-y-1">
                            {domains.find(d => d.domain_name === expandedDomain).ip_addresses.ipv6.map((ip) => (
                              <li key={ip} className={`text-sm ${themeClasses.text} bg-opacity-50 px-3 py-1 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-white'} truncate`} title={ip}>
                                {ip}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500">None found</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} transition-colors duration-200`}>
                    <h4 className={`font-medium mb-3 ${themeClasses.text} flex items-center`}>
                      <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center mr-2">
                        <FaList className="text-green-500 text-xs" />
                      </span>
                      HTTP Headers
                    </h4>
                    <div className={`max-h-60 overflow-y-auto ${theme === 'dark' ? 'scrollbar-dark' : 'scrollbar-light'}`}>
                      {Object.keys(domains.find(d => d.domain_name === expandedDomain).http_headers || {}).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(domains.find(d => d.domain_name === expandedDomain).http_headers || {}).map(([key, value]) => (
                            <div key={key} className={`px-3 py-2 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-white'}`}>
                              <span className={`font-medium text-sm ${themeClasses.text}`}>{key}: </span>
                              <span className="text-sm text-gray-500 break-all">{value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No HTTP headers available</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pagination Controls */}
          <div className={`px-6 py-4 flex flex-col sm:flex-row justify-between items-center ${themeClasses.border} border-t`}>
            <div className="flex flex-col sm:flex-row sm:items-center mb-4 sm:mb-0">
              <div className={`px-3 py-2 rounded-lg ${theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-50 text-blue-800'} mb-2 sm:mb-0`}>
                <span className="text-sm font-medium">
                  {sortedDomains.length} {sortedDomains.length === 1 ? 'domain' : 'domains'} found
                </span>
              </div>

              <div className="sm:ml-4 flex items-center">
                <span className={`text-sm ${themeClasses.text}`}>
                  {isShowingAll ? (
                    <span>Showing all domains</span>
                  ) : (
                    <span>Showing {sortedDomains.length > 0 ? indexOfFirstDomain + 1 : 0} to {Math.min(indexOfLastDomain, sortedDomains.length)} of {sortedDomains.length}</span>
                  )}
                </span>
                <div className="ml-4">
                  <select
                    className={`border ${themeClasses.border} rounded-md text-sm py-1.5 px-2 ${themeClasses.input} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    value={domainsPerPage}
                    onChange={(e) => changePageSize(e.target.value)}
                  >
                    {pageSizeOptions.map(size => (
                      <option key={size} value={size}>
                        {size === 'All' ? 'Show all' : `${size} per page`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {!isShowingAll && totalPages > 1 && (
              <div className="flex items-center">
                <button
                  onClick={prevPage}
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center px-4 py-2 border ${themeClasses.border} text-sm font-medium rounded-md mr-2 transition-colors duration-200 ${currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : `${themeClasses.text} hover:bg-gray-50`}`}
                >
                  Previous
                </button>
                
                <div className="hidden md:flex">
                  {totalPages <= 7 ? (
                    // Show all pages if there are 7 or fewer
                    [...Array(totalPages).keys()].map(number => (
                      <button
                        key={number + 1}
                        onClick={() => paginate(number + 1)}
                        className={`mx-1 px-4 py-2 border ${currentPage === number + 1 ? 
                          'bg-blue-500 text-white border-blue-500' : 
                          `${themeClasses.border} ${themeClasses.text} hover:bg-gray-50`} rounded-md transition-colors duration-200`}
                      >
                        {number + 1}
                      </button>
                    ))
                  ) : (
                    // Show limited pages with ellipsis for many pages
                    <>
                      {/* First page */}
                      <button
                        onClick={() => paginate(1)}
                        className={`mx-1 px-4 py-2 border ${currentPage === 1 ? 
                          'bg-blue-500 text-white border-blue-500' : 
                          `${themeClasses.border} ${themeClasses.text} hover:bg-gray-50`} rounded-md transition-colors duration-200`}
                      >
                        1
                      </button>

                      {/* Ellipsis if needed */}
                      {currentPage > 3 && (
                        <span className={`mx-1 px-4 py-2 border ${themeClasses.border} rounded-md bg-opacity-50 text-gray-500`}>...</span>
                      )}

                      {/* Pages around current page */}
                      {[...Array(5).keys()].map(i => {
                        const pageNum = Math.max(2, currentPage - 2) + i;
                        if (pageNum > 1 && pageNum < totalPages) {
                          return (
                            <button
                              key={pageNum}
                              onClick={() => paginate(pageNum)}
                              className={`mx-1 px-4 py-2 border ${currentPage === pageNum ? 
                                'bg-blue-500 text-white border-blue-500' : 
                                `${themeClasses.border} ${themeClasses.text} hover:bg-gray-50`} rounded-md transition-colors duration-200`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                        return null;
                      }).filter(Boolean)}

                      {/* Ellipsis if needed */}
                      {currentPage < totalPages - 2 && (
                        <span className={`mx-1 px-4 py-2 border ${themeClasses.border} rounded-md bg-opacity-50 text-gray-500`}>...</span>
                      )}

                      {/* Last page */}
                      <button
                        onClick={() => paginate(totalPages)}
                        className={`mx-1 px-4 py-2 border ${currentPage === totalPages ? 
                          'bg-blue-500 text-white border-blue-500' : 
                          `${themeClasses.border} ${themeClasses.text} hover:bg-gray-50`} rounded-md transition-colors duration-200`}
                      >
                        {totalPages}
                      </button>
                    </>
                  )}
                </div>
                
                <div className="flex md:hidden items-center mx-2">
                  <span className={`text-sm ${themeClasses.text}`}>
                    Page {currentPage} of {totalPages}
                  </span>
                </div>
                
                <button
                  onClick={nextPage}
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center px-4 py-2 border ${themeClasses.border} text-sm font-medium rounded-md transition-colors duration-200 ${currentPage === totalPages ? 'text-gray-400 cursor-not-allowed' : `${themeClasses.text} hover:bg-gray-50`}`}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Metadata Modal */}
      {showModal && detailedDomain && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center transition-opacity duration-300">
          <div className={`relative mx-auto p-6 border w-11/12 md:w-3/4 lg:w-2/3 xl:w-1/2 shadow-2xl rounded-lg ${themeClasses.modal} max-h-[90vh] overflow-y-auto transition-transform duration-300 transform animate-fadeIn`}>
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-semibold ${themeClasses.text} flex items-center`}>
                <FaGlobe className="text-blue-500 mr-3" />
                <span>Domain Analysis: {detailedDomain.domain_name}</span>
              </h3>
              <button
                onClick={closeDetailModal}
                className="text-gray-400 hover:text-gray-500 transition-colors duration-200 focus:outline-none"
              >
                <FaTimes className="text-xl" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="space-y-8">
              {/* Basic Information */}
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} transition-colors duration-200`}>
                <h4 className={`text-md font-medium mb-4 flex items-center ${themeClasses.text}`}>
                  <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                    <FaInfoCircle className="text-blue-500 text-xs" />
                  </span>
                  Basic Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Domain Name</p>
                    <p className={`text-sm ${themeClasses.text} flex items-center`}>
                      {detailedDomain.domain_name}
                      <a
                        href={`http://${detailedDomain.domain_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-500 hover:text-blue-700 transition-colors duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FaExternalLinkAlt className="text-xs" />
                      </a>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Tranco Rank</p>
                    <p className={`text-sm ${themeClasses.text}`}>
                    {detailedDomain.tranco_rank ? 
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'}`}>
                          #{detailedDomain.tranco_rank.toLocaleString()}
                        </span> : 
                        'Not in top 1M'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">HTTP Service</p>
                    <p className={`text-sm ${themeClasses.text}`}>
                      {detailedDomain.has_http_service ? 
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'}`}>
                          Available
                        </span> : 
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800'}`}>
                          Not Available
                        </span>
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Page Title</p>
                    <p className={`text-sm ${themeClasses.text}`}>{detailedDomain.page_title || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">First Analyzed</p>
                    <p className={`text-sm ${themeClasses.text}`}>
                      {new Date(detailedDomain.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Last Updated</p>
                    <p className={`text-sm ${themeClasses.text}`}>
                      {new Date(detailedDomain.updated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* IP Addresses */}
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} transition-colors duration-200`}>
                <h4 className={`text-md font-medium mb-4 flex items-center ${themeClasses.text}`}>
                  <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                    <FaServer className="text-blue-500 text-xs" />
                  </span>
                  IP Addresses
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h5 className={`text-sm font-medium mb-2 ${themeClasses.text}`}>IPv4 Addresses</h5>
                    {detailedDomain.ip_addresses.ipv4?.length > 0 ? (
                      <div className="space-y-2">
                        {detailedDomain.ip_addresses.ipv4.map((ip) => (
                          <div key={ip} className={`flex items-center p-2 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-white border border-gray-200'}`}>
                            <div className="flex-grow truncate">
                              <p className={`text-sm ${themeClasses.text}`}>{ip}</p>
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(ip)}
                              className="ml-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                              title="Copy IP address"
                            >
                              <FaClipboard className="text-xs" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No IPv4 addresses found</p>
                    )}
                  </div>
                  <div>
                    <h5 className={`text-sm font-medium mb-2 ${themeClasses.text}`}>IPv6 Addresses</h5>
                    {detailedDomain.ip_addresses.ipv6?.length > 0 ? (
                      <div className="space-y-2">
                        {detailedDomain.ip_addresses.ipv6.map((ip) => (
                          <div key={ip} className={`flex items-center p-2 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-white border border-gray-200'}`}>
                            <div className="flex-grow truncate">
                              <p className={`text-sm ${themeClasses.text} truncate`} title={ip}>{ip}</p>
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(ip)}
                              className="ml-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                              title="Copy IP address"
                            >
                              <FaClipboard className="text-xs" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No IPv6 addresses found</p>
                    )}
                  </div>
                </div>
              </div>

              {/* HTTP Headers */}
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} transition-colors duration-200`}>
                <h4 className={`text-md font-medium mb-4 flex items-center ${themeClasses.text}`}>
                  <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                    <FaList className="text-blue-500 text-xs" />
                  </span>
                  HTTP Headers
                </h4>
                
                {Object.keys(detailedDomain.http_headers || {}).length > 0 ? (
                  <div className={`max-h-64 overflow-y-auto ${theme === 'dark' ? 'scrollbar-dark' : 'scrollbar-light'}`}>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className={theme === 'dark' ? 'bg-gray-600' : 'bg-gray-100'}>
                        <tr>
                          <th className={`px-4 py-2 text-left text-xs font-medium ${themeClasses.text} uppercase tracking-wider sticky top-0 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-100'}`}>
                            Header
                          </th>
                          <th className={`px-4 py-2 text-left text-xs font-medium ${themeClasses.text} uppercase tracking-wider sticky top-0 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-100'}`}>
                            Value
                          </th>
                          <th className={`px-4 py-2 text-center text-xs font-medium ${themeClasses.text} uppercase tracking-wider sticky top-0 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-100'} w-16`}>
                            Copy
                          </th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${themeClasses.border}`}>
                        {Object.entries(detailedDomain.http_headers || {}).map(([key, value]) => (
                          <tr key={key} className={theme === 'dark' ? 'bg-gray-800' : 'bg-white'}>
                            <td className={`px-4 py-2 whitespace-nowrap text-sm font-medium ${themeClasses.text}`}>
                              {key}
                            </td>
                            <td className={`px-4 py-2 text-sm ${themeClasses.text} break-all`}>
                              {value}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-center">
                              <button
                                onClick={() => navigator.clipboard.writeText(`${key}: ${value}`)}
                                className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                                title="Copy header"
                              >
                                <FaClipboard className="text-xs mx-auto" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={`p-6 text-center rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-white border border-gray-200'}`}>
                    <p className="text-sm text-gray-500 italic">No HTTP headers available for this domain</p>
                  </div>
                )}
              </div>

              {/* Raw JSON Data (Collapsible) */}
              <div>
                <button 
                  onClick={() => document.getElementById('raw-json-content').classList.toggle('hidden')}
                  className={`w-full p-4 rounded-lg flex items-center justify-between ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} transition-colors duration-200`}
                >
                  <h4 className={`text-md font-medium flex items-center ${themeClasses.text}`}>
                    <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                      <FaClipboard className="text-blue-500 text-xs" />
                    </span>
                    Raw JSON Data
                  </h4>
                  <FaChevronDown className={`text-gray-400 transform transition-transform duration-200`} id="raw-json-chevron" />
                </button>
                
                <div id="raw-json-content" className="hidden mt-2">
                  <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} transition-colors duration-200 relative`}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(detailedDomain, null, 2));
                        // Show a temporary "Copied!" message
                        const copyNotification = document.createElement('div');
                        copyNotification.className = `absolute top-2 right-2 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 opacity-0 transition-opacity duration-300`;
                        copyNotification.textContent = 'Copied!';
                        document.getElementById('json-container').appendChild(copyNotification);
                        setTimeout(() => {
                          copyNotification.classList.remove('opacity-0');
                          copyNotification.classList.add('opacity-100');
                        }, 10);
                        setTimeout(() => {
                          copyNotification.classList.remove('opacity-100');
                          copyNotification.classList.add('opacity-0');
                        }, 2000);
                        setTimeout(() => {
                          copyNotification.remove();
                        }, 2300);
                      }}
                      className={`absolute top-4 right-4 px-2 py-1 rounded ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500' : 'bg-white hover:bg-gray-100'} text-xs flex items-center transition-colors duration-200`}
                      title="Copy JSON"
                    >
                      <FaClipboard className="mr-1" /> Copy
                    </button>
                    <div id="json-container" className={`overflow-x-auto max-h-64 ${theme === 'dark' ? 'scrollbar-dark' : 'scrollbar-light'}`}>
                      <pre className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-800'} font-mono p-1`}>
                        {JSON.stringify(detailedDomain, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-between">
              <button 
                onClick={() => reanalyzeDomain(new Event('click'), detailedDomain.domain_name)}
                className={`flex items-center px-4 py-2 ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
              >
                <FaSync className="mr-2" /> Reanalyze Domain
              </button>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => copyToClipboard(detailedDomain)}
                  className={`px-4 py-2 ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'} rounded-md transition-colors duration-200 focus:outline-none`}
                >
                  <FaClipboard className="mr-1 inline" /> Copy Data
                </button>
                
                <button
                  onClick={closeDetailModal}
                  className={`px-4 py-2 ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'} rounded-md transition-colors duration-200 focus:outline-none`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={`px-6 py-4 ${themeClasses.border} border-t flex flex-col sm:flex-row justify-between items-center`}>
        <div className="text-sm text-gray-500 mb-4 sm:mb-0">
          Domain Analyzer • Last updated: {new Date().toLocaleString()}
        </div>
        
        <div className="flex items-center">
          <button 
            onClick={fetchDomains}
            className={`flex items-center px-4 py-2 ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded-md transition-colors duration-200 mr-2`}
            title="Refresh data"
          >
            <FaSync className="mr-2 text-blue-500" />
            <span className={`text-sm ${themeClasses.text}`}>Refresh</span>
          </button>
          
          <select
            className={`border ${themeClasses.border} rounded-md text-sm py-2 px-3 ${themeClasses.input} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
            value={domainsPerPage}
            onChange={(e) => changePageSize(e.target.value)}
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>
                {size === 'All' ? 'Show all domains' : `Show ${size} per page`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* JavaScript for enhancing the collapsible sections */}
      <script dangerouslySetInnerHTML={{
        __html: `
          // Toggle Raw JSON chevron rotation
          document.getElementById('raw-json-content').addEventListener('toggle', function() {
            const chevron = document.getElementById('raw-json-chevron');
            if (this.classList.contains('hidden')) {
              chevron.classList.remove('rotate-180');
            } else {
              chevron.classList.add('rotate-180');
            }
          });
          
          // Add smooth scrolling to the modal
          const modal = document.querySelector('.fixed.inset-0');
          if (modal) {
            modal.querySelectorAll('a[href^="#"]').forEach(anchor => {
              anchor.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector(this.getAttribute('href')).scrollIntoView({
                  behavior: 'smooth'
                });
              });
            });
          }
        `
      }} />

      {/* Custom Styles */}
      <style jsx>{`
        /* Custom scrollbar for dark mode */
        .scrollbar-dark::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .scrollbar-dark::-webkit-scrollbar-track {
          background: #4b5563;
          border-radius: 4px;
        }
        .scrollbar-dark::-webkit-scrollbar-thumb {
          background: #6b7280;
          border-radius: 4px;
        }
        .scrollbar-dark::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        
        /* Custom scrollbar for light mode */
        .scrollbar-light::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .scrollbar-light::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        .scrollbar-light::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 4px;
        }
        .scrollbar-light::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        
        /* Fade-in animation for modal */
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
});

export default Dashboard;