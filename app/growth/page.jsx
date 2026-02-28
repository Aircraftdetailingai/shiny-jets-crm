"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function GrowthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [stats, setStats] = useState(null);
  const [equipment, setEquipment] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchData(token);
  }, [router]);

  const fetchData = async (token) => {
    try {
      const [servicesRes, statsRes, equipmentRes] = await Promise.all([
        fetch('/api/user/services', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/dashboard/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/equipment', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(data.services || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      if (equipmentRes.ok) {
        const data = await equipmentRes.json();
        setEquipment(data.equipment || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const enabledServices = services.filter(s => s.enabled);
  const avgRate = enabledServices.length > 0
    ? enabledServices.reduce((sum, s) => sum + (s.hourly_rate || 0), 0) / enabledServices.length
    : 0;

  // Calculate equipment ROI
  const equipmentWithROI = equipment
    .filter(e => e.jobs_completed > 0 && e.purchase_price > 0)
    .map(e => ({
      ...e,
      costPerJob: e.purchase_price / e.jobs_completed,
    }))
    .sort((a, b) => a.costPerJob - b.costPerJob);

  if (loading) {
    return <LoadingSpinner message={'Loading...'} />;
  }

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="text-white flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-2xl font-bold">{'Business Growth'}</h1>
        </div>
        <div className="space-x-4 text-sm">
          <a href="/products" className="underline">{'Inventory'}</a>
          <a href="/equipment" className="underline">{'Equipment'}</a>
          <a href="/roi" className="underline">ROI</a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* AI Sales Assistant CTA */}
        <a href="/growth/sales-assistant" className="block bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-5 shadow-lg hover:opacity-95 transition-opacity">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white text-lg font-bold">{'AI Sales Assistant'}</h2>
              <p className="text-indigo-200 text-sm mt-1">{'Research prospects and generate personalized cold call, email, and LinkedIn scripts'}</p>
            </div>
            <span className="text-white text-2xl">&#8594;</span>
          </div>
        </a>

        {/* Quick Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{'This Month Revenue'}</p>
              <p className="text-2xl font-bold text-gray-900">
                ${(stats.monthRevenue || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{'Jobs Completed'}</p>
              <p className="text-2xl font-bold text-blue-600">{stats.monthJobs || 0}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{'Active Services'}</p>
              <p className="text-2xl font-bold text-purple-600">{enabledServices.length}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{'Avg Hourly Rate'}</p>
              <p className="text-2xl font-bold text-green-600">{currencySymbol()}{formatPriceWhole(avgRate)}</p>
            </div>
          </div>
        )}

        {/* Business Growth Tips */}
        <div className="bg-white rounded-xl p-6 shadow">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{'Growth Opportunities'}</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <span className="text-2xl">&#128200;</span>
              <div>
                <p className="font-medium text-amber-900">{'Review Your Rates Annually'}</p>
                <p className="text-sm text-amber-700 mt-1">
                  {'Most detailers undercharge. Consider a 10% rate increase for long-term customers - most will stay.'}
                </p>
                <a href="/settings/services" className="text-sm text-amber-600 font-medium mt-2 inline-block hover:underline">
                  {'Update Service Rates'} &#8594;
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-2xl">&#128230;</span>
              <div>
                <p className="font-medium text-blue-900">{'Track Your Material Costs'}</p>
                <p className="text-sm text-blue-700 mt-1">
                  {'Know exactly what each job costs you. Track inventory and see your true profit margins.'}
                </p>
                <a href="/products" className="text-sm text-blue-600 font-medium mt-2 inline-block hover:underline">
                  {'Manage Inventory'} &#8594;
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <span className="text-2xl">&#128295;</span>
              <div>
                <p className="font-medium text-green-900">{'Know Your Equipment ROI'}</p>
                <p className="text-sm text-green-700 mt-1">
                  {'Track jobs per tool to understand which equipment investments paid off.'}
                </p>
                <a href="/equipment" className="text-sm text-green-600 font-medium mt-2 inline-block hover:underline">
                  {'View Equipment'} &#8594;
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Equipment ROI Leaderboard */}
        {equipmentWithROI.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">{'Equipment ROI'}</h2>
              <a href="/equipment" className="text-sm text-amber-600 hover:underline">{'View All'}</a>
            </div>
            <div className="space-y-2">
              {equipmentWithROI.slice(0, 5).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{idx === 0 ? '&#129351;' : idx === 1 ? '&#129352;' : idx === 2 ? '&#129353;' : '&#128295;'}</span>
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.jobs_completed} {'jobs'} {'Completed'.toLowerCase()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{currencySymbol()}{formatPriceWhole(item.costPerJob)}{'/job'}</p>
                    <p className="text-xs text-gray-400">{currencySymbol()}{formatPriceWhole(item.purchase_price)} {'invested'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Your Services */}
        <div className="bg-white rounded-xl p-6 shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">{'Your Services'}</h2>
            <a href="/settings/services" className="text-sm text-amber-600 hover:underline">{'Manage'}</a>
          </div>
          {enabledServices.length === 0 ? (
            <p className="text-gray-500">{'No services configured yet.'}</p>
          ) : (
            <div className="grid gap-2">
              {enabledServices.map((svc) => (
                <div key={svc.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-medium">{svc.service_name}</span>
                    {svc.category && (
                      <span className="text-xs text-gray-400 ml-2">{svc.category}</span>
                    )}
                  </div>
                  <span className="text-gray-600 font-medium">${svc.hourly_rate}{'/hr'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
