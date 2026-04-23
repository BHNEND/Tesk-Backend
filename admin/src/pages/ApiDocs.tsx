const ApiDocs = () => {
  const scalarUrl = `${window.location.origin}/api-docs/`;

  return (
    <div className="h-[calc(100vh-8rem)] -m-4 md:-m-8">
      <iframe
        src={scalarUrl}
        className="w-full h-full border-0"
        title="API Documentation"
      />
    </div>
  );
};

export default ApiDocs;
