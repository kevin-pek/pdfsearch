import {
  ActionPanel,
  Action,
  List,
  LocalStorage,
  Form,
  LaunchType,
  useNavigation,
  showToast,
  Alert,
  Icon,
  Color,
  confirmAlert,
} from "@raycast/api";
import { useState } from "react";
import Search from "./search";
import { showFailureToast, usePromise } from "@raycast/utils";
import { Collection } from "./wink";
import { processCollection } from "./ingest";

export default function Command() {
  const [searchText, setSearchText] = useState<string>("");

  const { data, isLoading, revalidate } = usePromise(async () => {
    const indexes = await LocalStorage.allItems();
    const parsedIndexes: { [key: string]: Collection } = {};
    Object.keys(indexes).forEach((key) => (parsedIndexes[key] = JSON.parse(indexes[key])));
    return parsedIndexes;
  });

  const handleDelete = async (name: string) => {
    await confirmAlert({
      title: `Delete Collection ${name}`,
      icon: { source: Icon.Trash, tintColor: Color.Red },
      message: "Are you sure you want to delete this collection?",
      primaryAction: {
        style: Alert.ActionStyle.Destructive,
        title: "Delete Collection",
        onAction: () => {
          LocalStorage.removeItem(name);
          revalidate();
          showToast({ title: "Success", message: `Successfully deleted collection ${name}!` });
        },
      },
    });
  };

  return (
    <List
      key="collections"
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search collections..."
      throttle
      actions={
        <ActionPanel>
          <Action.Push title="Create New Collection" target={<CreateCollectionForm revalidate={revalidate} />} />
        </ActionPanel>
      }
    >
      {data
        ? Object.keys(data)
            .filter((collection) => collection.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()))
            .map((key) => (
              <List.Item
                key={data[key].name}
                title={data[key].name}
                subtitle={data[key].description}
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Search"
                      target={
                        <Search arguments={{ collection: data[key].name }} launchType={LaunchType.UserInitiated} />
                      }
                    />

                    <Action.Push
                      title="Edit Collection"
                      target={<CreateCollectionForm collection={data[key]} revalidate={revalidate} />}
                    />
                    <Action.Push
                      title="Create New Collection"
                      target={<CreateCollectionForm revalidate={revalidate} />}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                    />
                    <Action
                      title="Delete Collection"
                      onAction={() => handleDelete(data[key].name)}
                      style={Action.Style.Destructive}
                    />
                  </ActionPanel>
                }
              />
            ))
        : null}
    </List>
  );
}

const supportedExtensions = [".pdf", ".pptx", ".docx", ".txt", ".md", ".tex"];

function CreateCollectionForm(props: {
  collection?: Collection;
  revalidate: () => Promise<{ [key: string]: Collection }>;
}) {
  const [name, setName] = useState(props.collection?.name ?? "");
  const [description, setDescription] = useState(props.collection?.description ?? "");
  const [files, setFiles] = useState(props.collection?.files ?? []);

  const [nameError, setNameError] = useState<string | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();
  const { pop } = useNavigation();

  const dropNameErrorIfNeeded = () => {
    if (nameError && nameError.length > 0) {
      setNameError(undefined);
    }
  };

  function dropFileErrorIfNeeded() {
    if (
      fileError &&
      fileError.length > 0 &&
      !files.some((f) => supportedExtensions.some((filetype) => f.endsWith(filetype)))
    ) {
      setFileError(undefined);
    }
  }

  const handleSubmit = async (values: Collection) => {
    if (values.files.length == 0) {
      setFileError("Select at least 1 file!");
    } else if (values.name.length == 0) {
      setNameError("Name shouldn't be empty!");
    } else if ((await LocalStorage.getItem(values.name)) && !props.collection) {
      setNameError("Name should be unique!");
    } else {
      try {
        const processed = await processCollection(values);
        if (processed && 'model' in processed && 'documents' in processed) {
          values.model = processed.model;
          values.documents = processed.documents;
          await LocalStorage.setItem(values.name, JSON.stringify(values));
          showToast({ title: "Success", message: "Files indexed successfully!" });
        } else {
          throw new Error("Failed to process files!")
        }
      } catch (err) {
        showFailureToast(err);
      }
      props.revalidate();
      pop();
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Collection Name"
        placeholder="Collection Name (Must be unique)"
        error={nameError}
        onChange={(e) => {
          setName(e);
          dropNameErrorIfNeeded();
        }}
        onBlur={async (event) => {
          if (event.target.value?.length == 0) {
            setNameError("Name shouldn't be empty!");
          } else if (!props.collection && event.target.value && (await LocalStorage.getItem(event.target.value))) {
            setNameError("Name should be unique!");
          } else {
            dropNameErrorIfNeeded();
          }
        }}
        value={name}
      />
      <Form.TextArea id="description" title="Description" onChange={setDescription} value={description} />
      <Form.FilePicker
        id="files"
        title="Files"
        allowMultipleSelection
        canChooseFiles
        canChooseDirectories
        error={fileError}
        onChange={(e) => {
          setFiles(e);
          dropFileErrorIfNeeded();
        }}
        onBlur={async (event) => {
          if (event.target.value?.length == 0) {
            setFileError("Select at least 1 file!");
          } else if (!files.some((f) => supportedExtensions.some((filetype) => f.endsWith(filetype)))) {
            setFileError("Unsupported file type detected!");
          } else {
            dropFileErrorIfNeeded();
          }
        }}
        value={files}
      />
    </Form>
  );
}
