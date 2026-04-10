import { useState } from 'react'

function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-blue-500 mb-4">
          Supply Chain Optimization
        </h1>
        <p className="text-gray-400 mb-8">
          Welcome to the Smart Supply Chain Dashboard.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-2">Shipment Status</h2>
            <div className="h-32 bg-gray-700/50 rounded flex items-center justify-center">
              Dashboard Overview Placeholder
            </div>
          </div>
          
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-2">Map View</h2>
            <div className="h-32 bg-gray-700/50 rounded flex items-center justify-center">
              Leaflet Map Placeholder
            </div>
          </div>

          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-2">Analytics</h2>
            <div className="h-32 bg-gray-700/50 rounded flex items-center justify-center">
              Recharts Analytic Placeholder
            </div>
          </div>
        </div>
      </header>
    </div>
  )
}

export default App
