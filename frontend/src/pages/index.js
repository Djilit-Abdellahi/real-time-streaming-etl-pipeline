import { useState, useRef } from 'react';
import Head from 'next/head';
import Dashboard from '../components/Dashboard';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [fetchingStatus, setFetchingStatus] = useState('');
  const dashboardRef = useRef(null);

  const analyzeUrl = async (inputUrl) => {
    if (!inputUrl) return;

    setLoading(true);
    setMessage('');
    setFetchingStatus('Extracting domains from URL...');

    try {
      // Use the scrape-url endpoint directly
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/scrape-url?url=${encodeURIComponent(inputUrl)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setMessage(`Successfully analyzed ${data.length} domains from ${inputUrl}`);

      // Refresh the dashboard to show the latest domains
      if (dashboardRef.current && dashboardRef.current.refreshDomains) {
        dashboardRef.current.refreshDomains();
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setFetchingStatus('');
      setUrl('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>Domain Analyzer</title>
        <meta name="description" content="Analyze domain metadata" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Domain Analyzer</h1>

        <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Analyze Domains</h2>

          <div className="max-w-3xl mx-auto">
            <div className="mb-6">
              <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 mb-1">
                Enter a URL to extract and analyze all domains
              </label>
              <div className="flex">
                <input
                  id="url-input"
                  type="text"
                  placeholder="https://example.com"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading) {
                      analyzeUrl(url);
                    }
                  }}
                  disabled={loading}
                />
                <button
                  className="bg-blue-500 text-white px-6 py-3 rounded-r-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-base disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors duration-200"
                  onClick={() => analyzeUrl(url)}
                  disabled={loading || !url.trim()}
                >
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-sm text-gray-500">Enter any URL to extract and analyze all domains found on that page</p>
                <button
                  className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none"
                  onClick={() => analyzeUrl('https://rimnow.com')}
                  disabled={loading}
                >
                  Try with rimnow.com
                </button>
              </div>
            </div>

            {fetchingStatus && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-md">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-3"></div>
                  <span className="text-blue-800">{fetchingStatus}</span>
                </div>
                <div className="mt-2 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                </div>
              </div>
            )}

            {message && (
              <div className={`mt-4 p-4 rounded-md ${message.includes('Error') ? 'bg-red-50 text-red-800 border border-red-100' : 'bg-green-50 text-green-800 border border-green-100'}`}>
                {message}
              </div>
            )}
          </div>
        </div>

        <Dashboard />
      </main>

      <footer className="bg-white py-6 text-center">
        <p className="text-gray-600">
          Domain Analyzer &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
